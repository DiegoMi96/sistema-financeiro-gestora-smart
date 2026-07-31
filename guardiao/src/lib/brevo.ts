import { BrevoClient } from "@getbrevo/brevo"

const TEMPLATE_ID = 493

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

  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) { console.error("[brevo] BREVO_API_KEY não definida"); return }
  if (toEmails.length === 0) { console.error("[brevo] nenhum destinatário"); return }

  const client = new BrevoClient({ apiKey })
  try {
    const res = await client.transactionalEmails.sendTransacEmail(payload)
    console.log("[brevo] enviado com sucesso:", JSON.stringify(res))
  } catch (err: any) {
    console.error("[brevo] erro ao enviar:", err?.message ?? err)
  }
}
