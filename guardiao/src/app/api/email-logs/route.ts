import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const rows = await sql`
    SELECT * FROM email_logs ORDER BY event_at DESC
  `

  const [summary] = await sql`
    SELECT
      COUNT(DISTINCT email)::int AS total_recipients,
      COUNT(*) FILTER (WHERE event = 'sent')::int AS total_sent,
      COUNT(*) FILTER (WHERE event = 'error')::int AS total_errors
    FROM email_logs
  `

  return NextResponse.json({ rows, summary })
}
