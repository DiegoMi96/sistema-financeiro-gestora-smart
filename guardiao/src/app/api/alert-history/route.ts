import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const competencia = searchParams.get("competencia") // "2026-06"

  const rows = await sql`
    SELECT *
    FROM alert_history
    WHERE
      (${competencia ?? null}::text IS NULL OR competencia = ${competencia ?? null})
    ORDER BY triggered_at DESC
  `

  // Meses disponíveis para o filtro
  const months = await sql`
    SELECT DISTINCT competencia
    FROM alert_history
    ORDER BY competencia DESC
  `

  return NextResponse.json({ rows, months: months.map((m: any) => m.competencia) })
}
