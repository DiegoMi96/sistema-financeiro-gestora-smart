import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

function onlyDigits(s: string): string {
  return (s ?? "").replace(/\D/g, "")
}

export async function GET(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const status       = searchParams.get("status")
  const contractType = searchParams.get("contract_type")

  const alerts = await sql`
    SELECT * FROM alerts
    WHERE
      (${status}::text           IS NULL OR status        = ${status})
      AND (${contractType}::text IS NULL OR contract_type = ${contractType})
    ORDER BY usage_percentage DESC
  `

  const clients = await sql`SELECT * FROM clients WHERE is_active = true`

  // Indexa clientes por CNPJ normalizado
  const clientByDoc = new Map<string, any>()
  for (const c of clients) {
    const dig = onlyDigits(c.cnpj)
    if (dig) clientByDoc.set(dig, c)
  }

  // Agrupa alertas por CPF/CNPJ normalizado
  const groups = new Map<string, any[]>()
  for (const alert of alerts) {
    const key = onlyDigits(alert.cpf_cnpj) || alert.client_name?.trim() || "—"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(alert)
  }

  const XLSX = await import("xlsx")
  const rows: Record<string, string | number>[] = []

  for (const [key, groupAlerts] of groups) {
    const first    = groupAlerts[0]
    const cadastro =
      clientByDoc.get(key) ??
      clients.find((c: any) => c.name?.trim().toLowerCase() === first.client_name?.trim().toLowerCase())

    rows.push({
      "Cliente":           first.client_name             || "—",
      "CPF/CNPJ":          first.cpf_cnpj                || "—",
      "Vendedor":          cadastro?.consultant_name      || "—",
      "WhatsApp":          cadastro?.phone                || "—",
      "E-mail":            cadastro?.email                || "—",
      "Pacote Mensageria": cadastro?.messaging_package    || "—",
      "Qtd. Linhas":       groupAlerts.length,
      "Linhas Acionadas":  groupAlerts.map((a: any) => a.line_number).join(", "),
    })
  }

  const ws = XLSX.utils.json_to_sheet(rows)
  ws["!cols"] = [
    { wch: 40 }, { wch: 20 }, { wch: 25 }, { wch: 18 },
    { wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 80 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Acionamentos")

  const buf      = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  const label    = status === "completed" ? "concluidos" : "pendentes"
  const date     = new Date().toISOString().slice(0, 10)
  const filename = `acionamentos_${label}_${date}.xlsx`

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
