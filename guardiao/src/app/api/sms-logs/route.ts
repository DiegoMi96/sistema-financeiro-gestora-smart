import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const rows = await sql`
    SELECT * FROM sms_logs ORDER BY sent_at DESC
  `

  const [summary] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE success)::int AS total_success,
      COUNT(*) FILTER (WHERE NOT success)::int AS total_failed
    FROM sms_logs
  `

  return NextResponse.json({ rows, summary })
}
