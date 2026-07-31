import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get("limit") ?? "20")
  const skip  = parseInt(searchParams.get("skip")  ?? "0")

  try {
    const snapshots = await sql`
      SELECT * FROM snapshots
      ORDER BY imported_at DESC
      LIMIT ${limit} OFFSET ${skip}
    `
    return NextResponse.json({ snapshots, total: snapshots.length })
  } catch (err: any) {
    console.error("Erro ao buscar snapshots:", err.message)
    return NextResponse.json({ snapshots: [], total: 0, error: err.message }, { status: 500 })
  }
}
