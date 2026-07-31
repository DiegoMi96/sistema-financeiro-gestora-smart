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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth) return NextResponse.json({ detail: "Acesso negado." }, { status: 403 })

    const users = await sql`
      SELECT id, email, full_name, role, is_active, created_at, last_login
      FROM users
      ORDER BY created_at ASC
    `

    return NextResponse.json({ users, total: users.length })
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth) return NextResponse.json({ detail: "Acesso negado." }, { status: 403 })

    const { email, full_name, password, role } = await request.json()

    if (!email || !full_name || !password) {
      return NextResponse.json({ detail: "Email, nome e senha são obrigatórios." }, { status: 400 })
    }

    const validRoles = ["admin", "analyst", "viewer"]
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ detail: "Role inválida." }, { status: 400 })
    }

    const password_hash = await bcrypt.hash(password, 10)

    const [user] = await sql`
      INSERT INTO users (email, password_hash, full_name, role)
      VALUES (${email.toLowerCase().trim()}, ${password_hash}, ${full_name}, ${role ?? "analyst"})
      RETURNING id, email, full_name, role, is_active, created_at
    `

    return NextResponse.json(user, { status: 201 })
  } catch (err: any) {
    if (err.message?.includes("unique")) {
      return NextResponse.json({ detail: "Este email já está cadastrado." }, { status: 409 })
    }
    return NextResponse.json({ detail: err.message }, { status: 500 })
  }
}
