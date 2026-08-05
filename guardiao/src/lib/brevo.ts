import { BrevoClient } from "@getbrevo/brevo"
import { sql } from "./db"

const TEMPLATE_ID = 493
const EMAIL_SUBJECT = "Guardião"

export interface AlertEmailData {
  line_number: string
  client_name?: string
  usage_percentage: number | string
  operator?: string
  competencia?: string
  contract_type?: string
  quota_mb?: number
}

export async function sendAlertNotification(
  alert: AlertEmailData,
  toEmails: string[],
): Promise<void> {
  const payload = {
    templateId: TEMPLATE_ID,
    to: toEmails.map((email) => ({ email })),
    params: {
      LINE_NUMBER:      alert.line_number,
      CLIENT_NAME:      alert.client_name     ?? "—",
      USAGE_PERCENTAGE: `${Number(alert.usage_percentage).toFixed(2)}%`,
      OPERATOR:         alert.operator        ?? "—",
      COMPETENCIA:      alert.competencia     ?? "—",
      CONTRACT_TYPE:    alert.contract_type === "shared" ? "Compartilhado" : "Individual",
      QUOTA_MB:         alert.quota_mb != null ? `${alert.quota_mb} MB` : "—",
    },
  }

  console.log("[brevo] payload:", JSON.stringify(payload, null, 2))

  const apiKey = process.env.GUARDIAO_BREVO_API_KEY
  if (!apiKey) { console.error("[brevo] GUARDIAO_BREVO_API_KEY não definida"); return }
  if (toEmails.length === 0) { console.error("[brevo] nenhum destinatário"); return }

  const client = new BrevoClient({ apiKey })
  try {
    const res: any = await client.transactionalEmails.sendTransacEmail(payload)
    console.log("[brevo] enviado com sucesso:", JSON.stringify(res))

    const messageId = res?.messageId ?? res?.messageIds?.[0] ?? null
    for (const email of toEmails) {
      await sql`
        INSERT INTO email_logs (email, event, subject, message_id, template_id)
        VALUES (${email}, 'sent', ${EMAIL_SUBJECT}, ${messageId}, ${TEMPLATE_ID})
      `
    }
  } catch (err: any) {
    console.error("[brevo] erro ao enviar:", err?.message ?? err)
    for (const email of toEmails) {
      await sql`
        INSERT INTO email_logs (email, event, subject, template_id, error_message)
        VALUES (${email}, 'error', ${EMAIL_SUBJECT}, ${TEMPLATE_ID}, ${String(err?.message ?? err)})
      `.catch((e) => console.error("[brevo] falha ao gravar log:", e))
    }
  }
}
