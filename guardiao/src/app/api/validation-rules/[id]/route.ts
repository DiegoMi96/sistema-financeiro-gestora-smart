import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  try {
    const { rule_name, applies_to, threshold_value, description } = await request.json()

    const [rule] = await sql`
      UPDATE validation_rules
      SET
        rule_name       = COALESCE(${rule_name}, rule_name),
        applies_to      = COALESCE(${applies_to}, applies_to),
        threshold_value = COALESCE(${threshold_value}, threshold_value),
        description     = COALESCE(${description}, description),
        updated_at      = NOW()
      WHERE id = ${params.id}
      RETURNING id, rule_name, applies_to, threshold_value, is_active, description, updated_at
    `

    if (!rule) return NextResponse.json({ error: "Regra não encontrada." }, { status: 404 })
    return NextResponse.json(rule)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireMainAuth(_req))) return unauthorizedResponse()

  try {
    // Regras padrão não podem ser deletadas
    const PROTECTED = ["rule-individual", "rule-shared", "rule-growth"]
    if (PROTECTED.includes(params.id)) {
      return NextResponse.json({ error: "Regras padrão não podem ser deletadas." }, { status: 400 })
    }

    await sql`DELETE FROM validation_rules WHERE id = ${params.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
