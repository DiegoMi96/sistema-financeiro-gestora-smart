import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  // Verifica o secret do cron da Vercel
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Busca todos os acionamentos concluídos
    const completed = await sql`
      SELECT * FROM alerts WHERE status = 'completed'
    `

    if (completed.length === 0) {
      return NextResponse.json({ archived: 0, deleted: 0, message: "Nenhum acionamento concluído para arquivar." })
    }

    // Arquiva na tabela alert_history
    for (const alert of completed) {
      await sql`
        INSERT INTO alert_history
          (original_id, line_number, client_name, cpf_cnpj, operator, contract_type,
           quota_mb, quota_gb, used_gb, usage_percentage, competencia,
           triggered_at, marked_as_done_at)
        VALUES
          (${alert.id}, ${alert.line_number}, ${alert.client_name}, ${alert.cpf_cnpj},
           ${alert.operator}, ${alert.contract_type}, ${alert.quota_mb}, ${alert.quota_gb},
           ${alert.used_gb}, ${alert.usage_percentage}, ${alert.competencia},
           ${alert.triggered_at}, ${alert.marked_as_done_at})
        ON CONFLICT DO NOTHING
      `
    }

    // Deleta os concluídos da tabela principal
    await sql`DELETE FROM alerts WHERE status = 'completed'`

    await sql`
      INSERT INTO audit_logs (action, entity_type, entity_id, details)
      VALUES ('monthly_cleanup', 'alert', 'bulk',
        ${JSON.stringify({ archived: completed.length, deleted: completed.length })}::jsonb)
    `

    return NextResponse.json({
      archived: completed.length,
      deleted:  completed.length,
      message:  `${completed.length} acionamento(s) arquivado(s) e removido(s) com sucesso.`,
    })

  } catch (err: any) {
    console.error("[cron/monthly-cleanup]", err?.message ?? err)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}
