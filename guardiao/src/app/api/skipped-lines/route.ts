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
