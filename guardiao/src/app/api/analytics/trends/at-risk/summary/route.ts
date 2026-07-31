import { NextRequest, NextResponse } from "next/server"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(_req: NextRequest) {
  if (!(await requireMainAuth(_req))) return unauthorizedResponse()

  return NextResponse.json({ at_risk_lines: [], total: 0 })
}
