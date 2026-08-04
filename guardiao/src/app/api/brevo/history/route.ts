import { NextRequest, NextResponse } from "next/server"
import { BrevoClient } from "@getbrevo/brevo"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 500
const MAX_PAGES = 20 // cap de segurança: 10.000 eventos

export async function GET(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const apiKey = process.env.GUARDIAO_BREVO_API_KEY
  if (!apiKey) return NextResponse.json({ events: [] })

  const client = new BrevoClient({ apiKey })
  const today = new Date().toISOString().split("T")[0]

  try {
    const allEvents: any[] = []
    let offset = 0

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await client.transactionalEmails.getEmailEventReport({
        startDate:  today,
        endDate:    today,
        templateId: 493,
        limit:      PAGE_SIZE,
        offset,
      })
      const pageEvents: any[] = (result as any).events ?? []
      allEvents.push(...pageEvents)
      if (pageEvents.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    return NextResponse.json({ events: allEvents })
  } catch (err: any) {
    console.error("[brevo/history]", err?.message ?? err)
    return NextResponse.json({ events: [] }, { status: 500 })
  }
}
