import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"
import { mapMainRoleToGuardiao } from "@/lib/roleMap"

export const dynamic = "force-dynamic"

// Segurança (31/07/2026): antes pública — qualquer um podia (re)criar um
// admin com senha fraca hardcoded (admin123). Agora exige admin do sistema
// principal. Login unificado torna esta rota pouco necessária, mas mantida
// (não removida) e apenas protegida, como pedido.
export async function POST(request: NextRequest) {
  const auth = await requireMainAuth(request)
  if (!auth || mapMainRoleToGuardiao(auth.role) !== "admin") return unauthorizedResponse()

  try {
    const [existing] = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`
    if (existing) {
      return NextResponse.json({ ok: false, message: "Já existe um admin cadastrado." })
    }

    const hash = await bcrypt.hash("admin123", 10)

    const [user] = await sql`
      INSERT INTO users (email, password_hash, full_name, role)
      VALUES ('admin@guardiao.com', ${hash}, 'Administrador', 'admin')
      RETURNING id, email, full_name, role
    `

    return NextResponse.json({
      ok: true,
      user,
      credentials: { email: "admin@guardiao.com", password: "admin123" },
      message: "Admin criado. Altere a senha após o primeiro login.",
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
