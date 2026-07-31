import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const status       = searchParams.get("status")
  const operator     = searchParams.get("operator")
  const contractType = searchParams.get("contract_type")
  const competencia  = searchParams.get("competencia")
  const lineNumber   = searchParams.get("line_number")
  const paginated    = searchParams.get("paginated") === "true"
  const skip         = parseInt(searchParams.get("skip") ?? "0")
  const limit        = parseInt(searchParams.get("limit") ?? "50")

  const lineLike = "%" + (lineNumber ?? "") + "%"

  const [data, countRow] = await Promise.all([
    sql`
      SELECT * FROM alerts
      WHERE
        (${status}::text        IS NULL OR status        = ${status})
        AND (${operator}::text  IS NULL OR operator      = ${operator})
        AND (${contractType}::text IS NULL OR contract_type = ${contractType})
        AND (${competencia}::text  IS NULL OR competencia   = ${competencia})
        AND (${lineNumber}::text   IS NULL OR line_number   ILIKE ${lineLike})
      ORDER BY triggered_at DESC
      LIMIT ${limit} OFFSET ${skip}
    `,
    sql`
      SELECT COUNT(*)::int AS total FROM alerts
      WHERE
        (${status}::text        IS NULL OR status        = ${status})
        AND (${operator}::text  IS NULL OR operator      = ${operator})
        AND (${contractType}::text IS NULL OR contract_type = ${contractType})
        AND (${competencia}::text  IS NULL OR competencia   = ${competencia})
        AND (${lineNumber}::text   IS NULL OR line_number   ILIKE ${lineLike})
    `,
  ])

  if (paginated) {
    return NextResponse.json({ data, total: countRow[0]?.total ?? 0 })
  }

  return NextResponse.json(data)
}
