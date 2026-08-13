import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const from  = searchParams.get("from")
  const to    = searchParams.get("to")
  const skip  = parseInt(searchParams.get("skip") ?? "0")
  const limit = parseInt(searchParams.get("limit") ?? "25")

  const [rows, [countRow]] = await Promise.all([
    sql`
      SELECT *
      FROM skipped_lines
      WHERE
        (${from ?? null}::date IS NULL OR skipped_at::date >= ${from ?? null}::date)
        AND
        (${to ?? null}::date IS NULL OR skipped_at::date <= ${to ?? null}::date)
      ORDER BY skipped_at DESC
      LIMIT ${limit} OFFSET ${skip}
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM skipped_lines
      WHERE
        (${from ?? null}::date IS NULL OR skipped_at::date >= ${from ?? null}::date)
        AND
        (${to ?? null}::date IS NULL OR skipped_at::date <= ${to ?? null}::date)
    `,
  ])

  return NextResponse.json({ rows, total: countRow?.total ?? 0 })
}

// Encaminha TODAS as linhas que batem com o filtro (from/to) — mesmo padrão
// do "concluir todos pendentes" dos acionamentos: 1 registro de auditoria em
// lote (não 1 por linha) antes de apagar tudo de uma vez.
export async function DELETE(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from")
  const to   = searchParams.get("to")

  const deleted = await sql`
    DELETE FROM skipped_lines
    WHERE
      (${from ?? null}::date IS NULL OR skipped_at::date >= ${from ?? null}::date)
      AND
      (${to ?? null}::date IS NULL OR skipped_at::date <= ${to ?? null}::date)
    RETURNING id
  `

  if (deleted.length > 0) {
    await sql`
      INSERT INTO audit_logs (action, entity_type, entity_id, details)
      VALUES ('skipped_lines_forwarded_bulk', 'skipped_line', 'bulk',
        ${JSON.stringify({ count: deleted.length, from: from ?? null, to: to ?? null })}::jsonb)
    `
  }

  return NextResponse.json({ deleted: deleted.length })
}
