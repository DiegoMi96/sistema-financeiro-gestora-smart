const SMS_ENDPOINT = "https://api.smsmarket.com.br/webservice-rest/send-single"

const ALERT_SMS_TEXT =
  "Alerta Guardiao - GESTORA SMART.\n\n" +
  "Detectamos linhas que chegaram em 100% da franquia contratada.\n" + 
  "Entre em contato com nosso time tecnico: Wa.me/551131642216."

function normalizePhoneNumber(raw: string): string {
  let digits = raw.replace(/\D/g, "")
  // já vem com DDI 55 (12 = DDD+fixo, 13 = DDD+celular) -> remove pra passar via country_code
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2)
  }
  return digits
}

export async function sendAlertSms(phone: string): Promise<void> {
  const user = process.env.SMSMARKET_USER
  const password = process.env.SMSMARKET_PASSWORD
  if (!user || !password) { console.error("[smsmarket] SMSMARKET_USER/SMSMARKET_PASSWORD não definidas"); return }

  const number = normalizePhoneNumber(phone)
  if (!number) { console.error("[smsmarket] telefone inválido:", phone); return }

  const content = ALERT_SMS_TEXT

  const auth = Buffer.from(`${user}:${password}`).toString("base64")
  const body = new URLSearchParams({
    type: "0",
    country_code: "55",
    number,
    content,
  })

  console.log("[smsmarket] enviando sms para:", number)

  try {
    const res = await fetch(SMS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    })
    const json = await res.json().catch(() => null)
    console.log("[smsmarket] resposta:", JSON.stringify(json))
  } catch (err: any) {
    console.error("[smsmarket] erro ao enviar sms:", err?.message ?? err)
  }
}
