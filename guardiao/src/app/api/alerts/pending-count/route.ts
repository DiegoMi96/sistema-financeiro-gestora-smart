import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(_req: NextRequest) {
  if (!(await requireMainAuth(_req))) return unauthorizedResponse()

  const [row] = await sql`SELECT COUNT(*)::int AS count FROM alerts WHERE status = 'pending'`
  return NextResponse.json({ count: row.count })
}
