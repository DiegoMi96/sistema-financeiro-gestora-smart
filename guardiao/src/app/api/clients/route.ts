import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const query = searchParams.get("query")

  const clients = query
    ? await sql`SELECT * FROM clients WHERE is_active = true AND (LOWER(name) LIKE ${"%" + query.toLowerCase() + "%"} OR cnpj LIKE ${"%" + query + "%"}) ORDER BY name`
    : await sql`SELECT * FROM clients WHERE is_active = true ORDER BY name`

  return NextResponse.json({ clients, total: clients.length })
}

export async function POST(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const body = await request.json()

  const [client] = await sql`
    INSERT INTO clients (cnpj, name, consultant_name, phone, email, messaging_package, is_active)
    VALUES (${body.cnpj ?? ""}, ${body.name ?? ""}, ${body.consultant_name ?? ""}, ${body.phone ?? ""}, ${body.email ?? ""}, ${body.messaging_package ?? ""}, true)
    RETURNING *
  `

  return NextResponse.json(client, { status: 201 })
}
