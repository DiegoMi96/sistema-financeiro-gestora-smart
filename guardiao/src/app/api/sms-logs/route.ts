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
    sql`SELECT * FROM sms_logs ORDER BY sent_at DESC LIMIT ${limit} OFFSET ${skip}`,
    sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE success)::int AS total_success,
        COUNT(*) FILTER (WHERE NOT success)::int AS total_failed
      FROM sms_logs
    `,
    sql`SELECT COUNT(*)::int AS total FROM sms_logs`,
  ])

  return NextResponse.json({ rows, summary, total: countRow?.total ?? 0 })
}
