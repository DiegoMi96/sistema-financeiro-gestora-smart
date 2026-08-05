import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const skip  = parseInt(searchParams.get("skip") ?? "0")
  const limit = parseInt(searchParams.get("limit") ?? "25")

  const [rows, [summary], [countRow]] = await Promise.all([
    sql`SELECT * FROM email_logs ORDER BY event_at DESC LIMIT ${limit} OFFSET ${skip}`,
    sql`
      SELECT
        COUNT(DISTINCT email)::int AS total_recipients,
        COUNT(*) FILTER (WHERE event = 'sent')::int AS total_sent,
        COUNT(*) FILTER (WHERE event = 'error')::int AS total_errors
      FROM email_logs
    `,
    sql`SELECT COUNT(*)::int AS total FROM email_logs`,
  ])

  return NextResponse.json({ rows, summary, total: countRow?.total ?? 0 })
}
