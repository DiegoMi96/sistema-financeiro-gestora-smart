import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(_req: NextRequest) {
  if (!(await requireMainAuth(_req))) return unauthorizedResponse()

  try {
    const rows = await sql`
      SELECT id, file_name, competencia, total_lines, total_alerts, processing_status, imported_at
      FROM snapshots
      ORDER BY imported_at DESC
      LIMIT 50
    `
    return NextResponse.json(rows)
  } catch (err: any) {
    return NextResponse.json([], { status: 500 })
  }
}
