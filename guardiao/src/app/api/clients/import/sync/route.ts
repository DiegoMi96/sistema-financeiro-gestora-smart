import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

const COL_MAP: Record<string, string> = {
  // Identificadores
  "cnpj":                        "cnpj",
  "cpf":                         "cpf",
  "cpf/cnpj":                    "cnpj",
  // Nome
  "razão social":                "name",
  "razao social":                "name",
  "nome":                        "name",
  "nome do cliente":             "name",
  "cliente":                     "name",
  // Vendedor / consultor
  "vendedor":                    "consultant_name",
  "consultor":                   "consultant_name",
  "consultor responsável":       "consultant_name",
  "consultor responsavel":       "consultant_name",
  // Contato
  "whatsapp":                    "phone",
  "telefone":                    "phone",
  "fone":                        "phone",
  "celular":                     "phone",
  // Email
  "email":                       "email",
  "e-mail":                      "email",
  // Pacote mensageria
  "assinante pacote mensageria": "messaging_package",
  "pacote de mensageria":        "messaging_package",
  "pacote mensageria":           "messaging_package",
  "pacote":                      "messaging_package",
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase()
}

export async function POST(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ detail: "Nenhum arquivo enviado" }, { status: 400 })
    }

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json({ detail: "Formato inválido. Envie um arquivo .xlsx ou .xls" }, { status: 400 })
    }

    const XLSX = await import("xlsx")
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" })

    // Procura aba "Clientes" ou usa a primeira
    const sheetName = workbook.SheetNames.find((n) => n.toLowerCase() === "clientes") ?? workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" })

    if (rows.length === 0) {
      return NextResponse.json({ detail: "Planilha vazia ou sem dados" }, { status: 400 })
    }

    // Valida que tem pelo menos Nome e algum identificador
    const rawHeaders = Object.keys(rows[0]).map(normalizeHeader)
    const hasIdentifier = rawHeaders.some((h) => ["cnpj", "cpf", "cpf/cnpj"].includes(h))
    const hasName = rawHeaders.some((h) => ["razão social", "razao social", "nome", "nome do cliente", "cliente"].includes(h))

    if (!hasIdentifier || !hasName) {
      return NextResponse.json({
        detail: "Planilha precisa ter pelo menos: Razão Social e CNPJ (ou CPF caso não tenha CNPJ)",
      }, { status: 422 })
    }

    let created = 0
    let updated = 0

    for (const rawRow of rows) {
      const row: Record<string, string> = {}
      for (const [k, v] of Object.entries(rawRow)) {
        const mapped = COL_MAP[normalizeHeader(k)]
        if (mapped) row[mapped] = String(v ?? "").trim()
      }

      const identifier = row.cnpj || row.cpf || ""
      if (!identifier) continue

      const existing = await sql`SELECT id FROM clients WHERE cnpj = ${identifier} LIMIT 1`

      if (existing.length > 0) {
        await sql`
          UPDATE clients SET
            name              = COALESCE(NULLIF(${row.name ?? ""}, ''), name),
            consultant_name   = COALESCE(NULLIF(${row.consultant_name ?? ""}, ''), consultant_name),
            phone             = COALESCE(NULLIF(${row.phone ?? ""}, ''), phone),
            email             = COALESCE(NULLIF(${row.email ?? ""}, ''), email),
            messaging_package = COALESCE(NULLIF(${row.messaging_package ?? ""}, ''), messaging_package)
          WHERE cnpj = ${identifier}
        `
        updated++
      } else {
        await sql`
          INSERT INTO clients (cnpj, name, consultant_name, phone, email, messaging_package, is_active)
          VALUES (${identifier}, ${row.name ?? ""}, ${row.consultant_name ?? ""}, ${row.phone ?? ""}, ${row.email ?? ""}, ${row.messaging_package ?? ""}, true)
        `
        created++
      }
    }

    return NextResponse.json({
      success: true,
      created,
      updated,
      deactivated: 0,
      message: `Importação concluída: ${created} criados, ${updated} atualizados.`,
    })
  } catch (err) {
    console.error("Erro na importação de clientes:", err)
    return NextResponse.json({ detail: "Erro interno ao processar arquivo" }, { status: 500 })
  }
}
