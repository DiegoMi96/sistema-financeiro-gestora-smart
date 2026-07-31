import { NextRequest, NextResponse } from "next/server"
import { createSchema } from "@/lib/schema"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"
import { mapMainRoleToGuardiao } from "@/lib/roleMap"

// Segurança (31/07/2026): rota de setup do schema (destrutiva/idempotente,
// mas sensível) agora exige admin do sistema principal. Antes era pública.
export async function POST(request: NextRequest) {
  const auth = await requireMainAuth(request)
  if (!auth || mapMainRoleToGuardiao(auth.role) !== "admin") return unauthorizedResponse()

  try {
    const result = await createSchema()
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
