import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireMainAuth(_req))) return unauthorizedResponse()

  try {
    const [snapshot] = await sql`
      SELECT id, import_date, file_name, total_lines, total_alerts, processing_status, imported_at
      FROM snapshots
      WHERE id = ${params.id}
    `
    if (!snapshot) return NextResponse.json({ detail: "Snapshot não encontrado" }, { status: 404 })
    return NextResponse.json(snapshot)
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 })
  }
}
