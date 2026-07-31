import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(_req: NextRequest) {
  if (!(await requireMainAuth(_req))) return unauthorizedResponse()

  try {
    const rules = await sql`
      SELECT id, rule_name, applies_to, threshold_value, is_active, description, updated_at
      FROM validation_rules
      ORDER BY created_at ASC
    `
    return NextResponse.json({ rules, total: rules.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  try {
    const { rule_name, applies_to, threshold_value, description } = await request.json()

    const [rule] = await sql`
      INSERT INTO validation_rules (rule_name, applies_to, threshold_value, description)
      VALUES (${rule_name}, ${applies_to ?? "all"}, ${threshold_value}, ${description ?? ""})
      RETURNING id, rule_name, applies_to, threshold_value, is_active, description
    `
    return NextResponse.json(rule, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
