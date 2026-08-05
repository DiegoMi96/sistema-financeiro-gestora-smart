import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { updateSnapshotCounters } from "@/lib/snapshot-utils"
import { sendAlertNotification } from "@/lib/brevo"
import { sendAlertSms } from "@/lib/smsmarket"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export async function POST(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const body = await request.json().catch(() => ({}))
  const contractType = body.contract_type as string | undefined

  // Busca alertas pendentes sem completar ainda
  const pendingAlerts = await sql`
    SELECT * FROM alerts
    WHERE status = 'pending'
      AND (${contractType ?? null}::text IS NULL OR contract_type = ${contractType ?? null})
  `

  const completed: any[] = []
  const not_emailed: { line_number: string; client_name: string }[] = []

  // Agrupa por cliente (CNPJ) — o e-mail e o SMS são genéricos (não citam
  // linha/porcentagem específica), então um cliente com várias linhas
  // concluídas junto recebe 1 e-mail + 1 SMS, não um de cada por linha.
  const groups = new Map<string, typeof pendingAlerts>()
  for (const alert of pendingAlerts) {
    const key = alert.cpf_cnpj ?? ""
    const group = groups.get(key)
    if (group) group.push(alert)
    else groups.set(key, [alert])
  }

  for (const [cnpj, alertsForClient] of groups) {
    const [client] = await sql`
      SELECT email, phone, messaging_package FROM clients
      WHERE cnpj = ${cnpj}
        AND is_active = true
        AND email IS NOT NULL
        AND email != ''
      LIMIT 1
    `

    if (!client?.email) {
      // Sem cliente/email → mantém pendente
      for (const alert of alertsForClient) {
        not_emailed.push({ line_number: alert.line_number, client_name: alert.client_name ?? "—" })
      }
      continue
    }

    // Cliente encontrado → conclui todas as linhas dele de uma vez
    const ids = alertsForClient.map((a) => a.id)
    const updated = await sql`
      UPDATE alerts SET status = 'completed', marked_as_done_at = NOW()
      WHERE id = ANY(${ids})
      RETURNING *
    `
    completed.push(...updated)

    const first = alertsForClient[0]
    sendAlertNotification(
      {
        line_number:      first.line_number,
        client_name:      first.client_name,
        usage_percentage: first.usage_percentage,
        operator:         first.operator,
        competencia:      first.competencia,
        contract_type:    first.contract_type,
        quota_mb:         first.quota_mb,
      },
      [client.email],
    ).catch((err) => console.error("[brevo] falha ao enviar email:", err))

    if (client.messaging_package === "Sim" && client.phone) {
      sendAlertSms(client.phone).catch((err) => console.error("[smsmarket] falha ao enviar sms:", err))
    }
  }

  const count = completed.length

  if (count > 0) {
    await updateSnapshotCounters({ pending: -count, resolved: count })
    await sql`
      INSERT INTO audit_logs (action, entity_type, entity_id, details)
      VALUES ('bulk_alert_resolved', 'alert', 'bulk',
        ${JSON.stringify({ count, contract_type: contractType ?? "all" })}::jsonb)
    `
  }

  return NextResponse.json({
    updated: count,
    message: count > 0
      ? `${count} acionamento${count !== 1 ? "s" : ""} concluído${count !== 1 ? "s" : ""} com sucesso.`
      : "Nenhum acionamento concluído.",
    not_emailed,
  })
}
