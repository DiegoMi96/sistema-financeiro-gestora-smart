import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { updateSnapshotCounters } from "@/lib/snapshot-utils"
import { sendAlertNotification } from "@/lib/brevo"
import { sendAlertSms } from "@/lib/smsmarket"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireMainAuth(_req))) return unauthorizedResponse()

  const [alert] = await sql`SELECT * FROM alerts WHERE id = ${params.id}`
  if (!alert) return NextResponse.json({ detail: "Alerta não encontrado" }, { status: 404 })
  return NextResponse.json(alert)
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const body = await request.json()

  // Para conclusão, verifica o cliente ANTES de marcar como concluído
  if (body.status === "completed") {
    const [currentAlert] = await sql`SELECT * FROM alerts WHERE id = ${params.id}`
    if (!currentAlert) return NextResponse.json({ detail: "Alerta não encontrado" }, { status: 404 })

    const [client] = await sql`
      SELECT email, phone, messaging_package FROM clients
      WHERE cnpj = ${currentAlert.cpf_cnpj ?? ""}
        AND is_active = true
        AND email IS NOT NULL
        AND email != ''
      LIMIT 1
    `

    // Sem cliente cadastrado ou sem email → mantém pendente
    if (!client?.email) {
      console.log("[brevo] cliente não encontrado — acionamento bloqueado:", currentAlert.line_number)
      return NextResponse.json({
        alert: currentAlert,
        not_emailed: [{ line_number: currentAlert.line_number, client_name: currentAlert.client_name ?? "—" }],
        blocked: true,
      })
    }

    // Cliente encontrado → conclui e envia email
    const [alert] = await sql`
      UPDATE alerts SET
        status            = 'completed',
        marked_as_done_at = NOW()
      WHERE id = ${params.id}
      RETURNING *
    `

    await updateSnapshotCounters({ pending: -1, resolved: 1 })
    await sql`
      INSERT INTO audit_logs (action, entity_type, entity_id, details)
      VALUES ('alert_resolved', 'alert', ${params.id},
        ${JSON.stringify({ line_number: alert.line_number, client_name: alert.client_name, usage_percentage: alert.usage_percentage })}::jsonb)
    `

    sendAlertNotification(
      {
        line_number:      alert.line_number,
        client_name:      alert.client_name,
        usage_percentage: alert.usage_percentage,
        operator:         alert.operator,
        competencia:      alert.competencia,
        contract_type:    alert.contract_type,
        quota_mb:         alert.quota_mb,
      },
      [client.email],
    ).catch((err) => console.error("[brevo] falha ao enviar email:", err))

    if (client.messaging_package === "Sim" && client.phone) {
      sendAlertSms(client.phone).catch((err) => console.error("[smsmarket] falha ao enviar sms:", err))
    }

    return NextResponse.json({ alert, not_emailed: [], blocked: false })
  }

  // Outras atualizações de status (não conclusão)
  const [alert] = await sql`
    UPDATE alerts SET
      status            = COALESCE(${body.status ?? null}, status),
      marked_as_done_at = CASE WHEN ${body.status ?? null} = 'completed' THEN NOW() ELSE marked_as_done_at END
    WHERE id = ${params.id}
    RETURNING *
  `

  if (!alert) return NextResponse.json({ detail: "Alerta não encontrado" }, { status: 404 })

  return NextResponse.json({ alert, not_emailed: [], blocked: false })
}
