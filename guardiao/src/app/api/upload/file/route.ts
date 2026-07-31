import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

const COL_MAP: Record<string, string> = {
  "cpf/cnpj":                   "cpf_cnpj",
  "nome do cliente":            "client_name",
  "franquia (mb)":              "quota_mb",
  "msisdn":                     "line_number",
  "status do bloqueio de rede": "block_status",
  "operadora":                  "operator",
  "tipo de compartilhamento":   "contract_type",
  "porcentagem de consumo":     "usage_percentage",
}

const REQUIRED_COLS = ["msisdn", "nome do cliente", "franquia (mb)", "porcentagem de consumo", "operadora", "tipo de compartilhamento"]

function normalizeHeader(h: string) {
  return h.trim().toLowerCase()
}

function mapContractType(raw: string): "individual" | "shared" {
  const v = (raw ?? "").toUpperCase().trim()
  if (v === "TOTAL" || v === "SHARED" || v === "COMPARTILHADO") return "shared"
  return "individual"
}

function getCompetencia() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
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
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" })

    if (rows.length === 0) {
      return NextResponse.json({ detail: "Planilha vazia" }, { status: 400 })
    }

    const rawHeaders = Object.keys(rows[0]).map(normalizeHeader)
    const missingCols = REQUIRED_COLS.filter((col) => !rawHeaders.includes(col))
    if (missingCols.length > 0) {
      return NextResponse.json({
        detail: `Colunas obrigatórias não encontradas: ${missingCols.join(", ")}`,
      }, { status: 422 })
    }

    // Lê thresholds das regras ativas no banco
    const activeRules = await sql`
      SELECT applies_to, threshold_value FROM validation_rules WHERE is_active = true
    `
    const thresholdIndividual = Number(
      activeRules.find((r: any) => r.applies_to === "individual")?.threshold_value ?? 100
    )
    const thresholdShared = Number(
      activeRules.find((r: any) => r.applies_to === "shared")?.threshold_value ?? 300
    )

    // Busca linhas já acionadas (concluídas) para não regerar
    const doneRows = await sql`SELECT line_number FROM alerts WHERE status = 'completed'`
    const alreadyDone = new Set(doneRows.map((r: any) => r.line_number))

    // Carrega clientes com pacote de mensageria ativo para lookup rápido
    const clientsWithPackage = await sql`
      SELECT cnpj FROM clients WHERE is_active = true AND messaging_package = 'Sim'
    `
    const hasMessaging = new Set(clientsWithPackage.map((r: any) => r.cnpj))

    // Remove alertas pendentes antigos (serão substituídos pelos do novo upload)
    await sql`DELETE FROM alerts WHERE status = 'pending'`
    // Remove registros de ignorados do mês atual (serão regravados)
    const competencia = getCompetencia()
    await sql`DELETE FROM skipped_lines WHERE competencia = ${competencia}`

    let processedCount = 0
    let alertsGenerated = 0
    let skippedAlreadyDone = 0
    let skippedNoMessaging = 0

    for (const rawRow of rows) {
      const row: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(rawRow)) {
        const mapped = COL_MAP[normalizeHeader(k)]
        if (mapped) row[mapped] = v
      }

      const lineNumber   = String(row.line_number ?? "").trim()
      const clientName   = String(row.client_name ?? "").trim()
      const quotaMb      = parseFloat(String(row.quota_mb ?? "0").replace(",", ".")) || 0
      const usagePct     = parseFloat(String(row.usage_percentage ?? "0").replace(",", ".").replace("%", "")) || 0
      const operator     = String(row.operator ?? "").trim()
      const contractType = mapContractType(String(row.contract_type ?? ""))
      const blockStatus  = String(row.block_status ?? "").trim()
      const cpfCnpj      = String(row.cpf_cnpj ?? "").trim()

      if (!lineNumber) continue
      processedCount++

      const quotaGb  = quotaMb / 1024
      const usedGb   = (usagePct / 100) * quotaGb
      const usedMb   = usedGb * 1024
      const threshold = contractType === "shared" ? thresholdShared : thresholdIndividual

      if (usagePct >= threshold) {
        if (alreadyDone.has(lineNumber)) {
          skippedAlreadyDone++
          continue
        }

        // Sem pacote de mensageria → registra em skipped_lines e ignora
        if (!hasMessaging.has(cpfCnpj)) {
          await sql`
            INSERT INTO skipped_lines
              (line_number, client_name, cpf_cnpj, operator, contract_type,
               quota_mb, used_mb, usage_percentage, competencia, reason)
            VALUES
              (${lineNumber}, ${clientName}, ${cpfCnpj}, ${operator}, ${contractType},
               ${quotaMb}, ${Math.round(usedMb * 100) / 100}, ${usagePct}, ${competencia}, 'sem_mensageria')
          `
          skippedNoMessaging++
          continue
        }

        const alertId = `${lineNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

        await sql`
          INSERT INTO alerts
            (id, line_number, client_name, cpf_cnpj, operator, contract_type,
             quota_mb, quota_gb, used_gb, usage_percentage, block_status, competencia, status)
          VALUES
            (${alertId}, ${lineNumber}, ${clientName}, ${cpfCnpj}, ${operator}, ${contractType},
             ${quotaMb}, ${Math.round(quotaGb * 100) / 100}, ${Math.round(usedGb * 100) / 100},
             ${usagePct}, ${blockStatus}, ${competencia}, 'pending')
          ON CONFLICT (id) DO NOTHING
        `
        alertsGenerated++
      }
    }

    // Calcula resolved_month já existente neste mês para inicializar o novo snapshot
    const [monthRow] = await sql`
      SELECT COALESCE(SUM(resolved_day), 0)::int AS total
      FROM snapshots
      WHERE competencia = ${competencia}
    `
    const resolvedMonthSoFar = monthRow?.total ?? 0

    // Registra snapshot com os contadores do dia
    const snapshotId = `snap-${Date.now()}`
    await sql`
      INSERT INTO snapshots
        (id, import_date, file_name, competencia, total_lines, total_alerts,
         pending_day, resolved_day, resolved_month, processing_status)
      VALUES
        (${snapshotId}, ${new Date().toISOString().split("T")[0]}, ${file.name}, ${competencia},
         ${processedCount}, ${alertsGenerated},
         ${alertsGenerated}, 0, ${resolvedMonthSoFar}, 'success')
    `

    const skipMsgs = []
    if (skippedAlreadyDone > 0)   skipMsgs.push(`${skippedAlreadyDone} já acionada(s) anteriormente`)
    if (skippedNoMessaging > 0)   skipMsgs.push(`${skippedNoMessaging} sem pacote de mensageria`)
    const skipMsg = skipMsgs.length > 0 ? ` Ignoradas: ${skipMsgs.join(", ")}.` : ""

    return NextResponse.json({
      import_id:                snapshotId,
      file_name:                file.name,
      rows_processed:           processedCount,
      alerts_generated:         alertsGenerated,
      alerts_skipped_done:      skippedAlreadyDone,
      alerts_skipped_messaging: skippedNoMessaging,
      success:                  true,
      message:                  `Arquivo processado com sucesso. ${processedCount} linhas importadas, ${alertsGenerated} novos acionamentos gerados.${skipMsg}`,
    })

  } catch (err) {
    console.error("Erro no upload:", err)
    return NextResponse.json({ detail: "Erro interno ao processar arquivo" }, { status: 500 })
  }
}
