import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"
import { mapMainRoleToGuardiao } from "@/lib/roleMap"

export const dynamic = "force-dynamic"

// Segurança (31/07/2026): rota DESTRUTIVA (apaga alerts/snapshots/audit_logs)
// estava totalmente pública. Agora exige admin do sistema principal.
export async function POST(request: NextRequest) {
  const auth = await requireMainAuth(request)
  if (!auth || mapMainRoleToGuardiao(auth.role) !== "admin") return unauthorizedResponse()

  try {
    await sql`DELETE FROM alerts`
    await sql`DELETE FROM snapshots`
    await sql`DELETE FROM audit_logs`

    return NextResponse.json({ ok: true, message: "Tabelas limpas (usuários, clientes e regras preservados)." })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
