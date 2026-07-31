import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { sql } from "@/lib/db"
import { requireMainAuth } from "@/lib/mainAuth"
import { mapMainRoleToGuardiao } from "@/lib/roleMap"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Login unificado (31/07/2026): admin é decidido pelo papel do sistema
// principal (mapeado via roleMap.ts), não mais pelo JWT próprio do Guardião.
async function requireAdmin(request: NextRequest) {
  const payload = await requireMainAuth(request)
  if (!payload || mapMainRoleToGuardiao(payload.role) !== "admin") return null
  return payload
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin(request)
    if (!auth) return NextResponse.json({ detail: "Acesso negado." }, { status: 403 })

    const body = await request.json()
    const { full_name, role, is_active, password } = body

    if (role) {
      const validRoles = ["admin", "analyst", "viewer"]
      if (!validRoles.includes(role)) {
        return NextResponse.json({ detail: "Role inválida." }, { status: 400 })
      }
    }

    // Atualiza campos enviados
    if (full_name !== undefined) {
      await sql`UPDATE users SET full_name = ${full_name} WHERE id = ${params.id}`
    }
    if (role !== undefined) {
      await sql`UPDATE users SET role = ${role} WHERE id = ${params.id}`
    }
    if (is_active !== undefined) {
      await sql`UPDATE users SET is_active = ${is_active} WHERE id = ${params.id}`
    }
    if (password) {
      const hash = await bcrypt.hash(password, 10)
      await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${params.id}`
    }

    const [updated] = await sql`
      SELECT id, email, full_name, role, is_active, created_at, last_login
      FROM users WHERE id = ${params.id}
    `

    if (!updated) return NextResponse.json({ detail: "Usuário não encontrado." }, { status: 404 })

    return NextResponse.json(updated)
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin(request)
    if (!auth) return NextResponse.json({ detail: "Acesso negado." }, { status: 403 })

    // Não permite deletar o próprio usuário
    if (auth.sub === params.id) {
      return NextResponse.json({ detail: "Você não pode deletar seu próprio usuário." }, { status: 400 })
    }

    await sql`DELETE FROM users WHERE id = ${params.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 })
  }
}
