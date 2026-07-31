import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from")
  const to   = searchParams.get("to")

  const rows = await sql`
    SELECT *
    FROM skipped_lines
    WHERE
      (${from ?? null}::date IS NULL OR skipped_at::date >= ${from ?? null}::date)
      AND
      (${to ?? null}::date IS NULL OR skipped_at::date <= ${to ?? null}::date)
    ORDER BY skipped_at DESC
  `

  return NextResponse.json({ rows })
}
