import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { sql } from "@/lib/db"
import { signToken } from "@/lib/jwt"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ detail: "Email e senha são obrigatórios." }, { status: 400 })
    }

    const [user] = await sql`
      SELECT id, email, full_name, role, is_active, password_hash
      FROM users
      WHERE email = ${email.toLowerCase().trim()}
    `

    if (!user) {
      return NextResponse.json({ detail: "Email ou senha inválidos." }, { status: 401 })
    }

    if (!user.is_active) {
      return NextResponse.json({ detail: "Usuário inativo. Contate o administrador." }, { status: 403 })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ detail: "Email ou senha inválidos." }, { status: 401 })
    }

    await sql`UPDATE users SET last_login = NOW() WHERE id = ${user.id}`

    const access_token  = await signToken({ sub: user.id, role: user.role })
    const refresh_token = await signToken({ sub: user.id, role: user.role })

    return NextResponse.json({ access_token, refresh_token, token_type: "bearer" })
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 })
  }
}
