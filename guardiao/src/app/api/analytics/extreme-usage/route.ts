import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(_req: NextRequest) {
  if (!(await requireMainAuth(_req))) return unauthorizedResponse()

  try {
    const competencia = new Date().toISOString().slice(0, 7) // "YYYY-MM"

    const lines = await sql`
      SELECT
        line_number,
        client_name,
        operator,
        contract_type,
        usage_percentage,
        quota_gb,
        used_gb,
        competencia,
        status,
        triggered_at
      FROM alerts
      WHERE competencia = ${competencia}
        AND usage_percentage >= 1000
      ORDER BY usage_percentage DESC
    `

    return NextResponse.json({
      competencia,
      total: lines.length,
      lines,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
