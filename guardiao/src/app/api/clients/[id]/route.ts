import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"
import { normalizeCnpj } from "@/lib/cnpj"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const body = await request.json()

  const [client] = await sql`
    UPDATE clients SET
      cnpj              = COALESCE(${body.cnpj != null ? normalizeCnpj(body.cnpj) : null}, cnpj),
      name              = COALESCE(${body.name ?? null}, name),
      consultant_name   = COALESCE(${body.consultant_name ?? null}, consultant_name),
      phone             = COALESCE(${body.phone ?? null}, phone),
      email             = COALESCE(${body.email ?? null}, email),
      messaging_package = COALESCE(${body.messaging_package ?? null}, messaging_package)
    WHERE id = ${params.id}
    RETURNING *
  `

  if (!client) return NextResponse.json({ detail: "Cliente não encontrado" }, { status: 404 })
  return NextResponse.json(client)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireMainAuth(_req))) return unauthorizedResponse()

  const [client] = await sql`
    UPDATE clients SET is_active = false WHERE id = ${params.id} RETURNING id
  `
  if (!client) return NextResponse.json({ detail: "Cliente não encontrado" }, { status: 404 })
  return NextResponse.json({ id: params.id, deleted: true })
}
