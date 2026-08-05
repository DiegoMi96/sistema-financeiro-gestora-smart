import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.GUARDIAO_CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const deleted = await sql`DELETE FROM email_logs RETURNING id`

    await sql`
      INSERT INTO audit_logs (action, entity_type, entity_id, details)
      VALUES ('email_logs_cleanup', 'email_log', 'bulk', ${JSON.stringify({ deleted: deleted.length })}::jsonb)
    `

    return NextResponse.json({
      deleted:  deleted.length,
      message:  `${deleted.length} log(s) de e-mail removido(s) com sucesso.`,
    })
  } catch (err: any) {
    console.error("[cron/email-cleanup]", err?.message ?? err)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}
