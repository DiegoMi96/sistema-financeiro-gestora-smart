import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { verifyToken, extractToken } from "@/lib/jwt"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const token   = extractToken(request.headers.get("Authorization"))
    const payload = token ? await verifyToken(token) : null

    if (!payload) {
      return NextResponse.json({ detail: "Não autorizado." }, { status: 401 })
    }

    const [user] = await sql`
      SELECT id, email, full_name, role, is_active, created_at, last_login
      FROM users
      WHERE id = ${payload.sub} AND is_active = true
    `

    if (!user) {
      return NextResponse.json({ detail: "Usuário não encontrado." }, { status: 404 })
    }

    return NextResponse.json(user)
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 })
  }
}
