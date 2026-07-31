import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireMainAuth(_req))) return unauthorizedResponse()

  try {
    const [rule] = await sql`
      UPDATE validation_rules
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE id = ${params.id}
      RETURNING id, is_active
    `
    if (!rule) return NextResponse.json({ error: "Regra não encontrada." }, { status: 404 })
    return NextResponse.json(rule)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
