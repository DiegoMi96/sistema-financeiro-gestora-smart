import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(
  _req: NextRequest,
  { params }: { params: { lineNumber: string } }
) {
  if (!(await requireMainAuth(_req))) return unauthorizedResponse()

  try {
    const line = params.lineNumber.trim()

    const history = await sql`
      SELECT
        id,
        client_name,
        operator,
        contract_type,
        usage_percentage,
        quota_gb,
        used_gb,
        competencia,
        status,
        triggered_at,
        marked_as_done_at
      FROM alerts
      WHERE line_number = ${line}
        AND triggered_at >= NOW() - INTERVAL '90 days'
      ORDER BY triggered_at DESC
    `

    return NextResponse.json({
      line_number: line,
      total:       history.length,
      history,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
