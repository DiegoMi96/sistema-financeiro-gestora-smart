import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"
import { normalizeCnpj } from "@/lib/cnpj"

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

    // Monta a lista de clientes a partir da planilha. Se o mesmo identificador
    // (CNPJ/CPF) aparecer mais de uma vez, a última ocorrência vence — evita o
    // erro do Postgres "ON CONFLICT DO UPDATE command cannot affect row a
    // second time" quando duas linhas do mesmo lote tentam upsertar a mesma
    // chave.
    const seen = new Map<string, {
      cnpj: string; name: string; consultant_name: string
      phone: string; email: string; messaging_package: string; is_active: boolean
    }>()

    for (const rawRow of rows) {
      const row: Record<string, string> = {}
      for (const [k, v] of Object.entries(rawRow)) {
        const mapped = COL_MAP[normalizeHeader(k)]
        if (mapped) row[mapped] = String(v ?? "").trim()
      }

      const identifier = normalizeCnpj(row.cnpj || row.cpf || "")
      if (!identifier) continue

      seen.set(identifier, {
        cnpj:              identifier,
        name:              row.name ?? "",
        consultant_name:   row.consultant_name ?? "",
        phone:             row.phone ?? "",
        email:             row.email ?? "",
        messaging_package: row.messaging_package ?? "",
        is_active:         true,
      })
    }

    const clients = Array.from(seen.values())

    // Upsert em lote (em vez de 1 SELECT + 1 INSERT/UPDATE por linha) — muito
    // mais rápido em planilhas grandes. BATCH_SIZE limita o tamanho de cada
    // comando SQL para não estourar o limite de parâmetros do Postgres.
    const BATCH_SIZE = 500
    let created = 0
    let updated = 0

    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE)
      const result = await sql`
        INSERT INTO clients ${sql(batch, "cnpj", "name", "consultant_name", "phone", "email", "messaging_package", "is_active")}
        ON CONFLICT (cnpj) DO UPDATE SET
          name              = COALESCE(NULLIF(EXCLUDED.name, ''), clients.name),
          consultant_name   = COALESCE(NULLIF(EXCLUDED.consultant_name, ''), clients.consultant_name),
          phone             = COALESCE(NULLIF(EXCLUDED.phone, ''), clients.phone),
          email             = COALESCE(NULLIF(EXCLUDED.email, ''), clients.email),
          messaging_package = COALESCE(NULLIF(EXCLUDED.messaging_package, ''), clients.messaging_package)
        RETURNING (xmax = 0) AS inserted
      `
      for (const row of result) {
        if (row.inserted) created++
        else updated++
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
