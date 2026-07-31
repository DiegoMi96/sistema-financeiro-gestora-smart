import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(_req: NextRequest) {
  if (!(await requireMainAuth(_req))) return unauthorizedResponse()

  try {
    const [snapshotRow] = await sql`
      SELECT total_lines FROM snapshots ORDER BY imported_at DESC LIMIT 1
    `

    const [pendingCount] = await sql`
      SELECT COUNT(*)::int AS count FROM alerts WHERE status = 'pending'
    `

    const [resolvedCounts] = await sql`
      SELECT
        COALESCE(SUM(
          CASE WHEN action = 'alert_resolved'      THEN 1
               WHEN action = 'bulk_alert_resolved' THEN (details->>'count')::int
               ELSE 0 END
        ) FILTER (WHERE created_at::date = CURRENT_DATE), 0)::int AS resolved_today,
        COALESCE(SUM(
          CASE WHEN action = 'alert_resolved'      THEN 1
               WHEN action = 'bulk_alert_resolved' THEN (details->>'count')::int
               ELSE 0 END
        ) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())), 0)::int AS resolved_month
      FROM audit_logs
    `

    const recentSnapshots = await sql`
      SELECT id, import_date, file_name, total_lines, total_alerts, processing_status
      FROM snapshots
      ORDER BY imported_at DESC
      LIMIT 5
    `

    const dailyAlerts = await sql`
      SELECT
        TO_CHAR(triggered_at, 'DD/MM') AS date,
        COUNT(*)::int                  AS alerts
      FROM alerts
      WHERE triggered_at >= NOW() - INTERVAL '7 days'
      GROUP BY date
      ORDER BY MIN(triggered_at)
    `

    const byOperator = await sql`
      SELECT
        operator                                              AS name,
        COUNT(*)::int                                         AS alerts,
        COUNT(*) FILTER (WHERE usage_percentage >= 300)::int AS high
      FROM alerts
      WHERE operator IS NOT NULL AND operator <> ''
      GROUP BY operator
      ORDER BY alerts DESC
      LIMIT 6
    `

    const byContractType = await sql`
      SELECT
        contract_type AS name,
        COUNT(*)::int AS value
      FROM alerts
      GROUP BY contract_type
    `

    return NextResponse.json({
      kpis: {
        total_lines:    Number(snapshotRow?.total_lines      ?? 0),
        pending_alerts: Number(pendingCount?.count           ?? 0),
        resolved_today: Number(resolvedCounts?.resolved_today  ?? 0),
        resolved_month: Number(resolvedCounts?.resolved_month  ?? 0),
      },
      daily_alerts:      dailyAlerts,
      by_operator:       byOperator,
      recent_snapshots:  recentSnapshots,
      by_contract_type:  byContractType.map((r: any) => ({
        name:  r.name === "shared" ? "Compartilhado" : "Individual",
        value: r.value,
        color: r.name === "shared" ? "#8b5cf6" : "#3b82f6",
      })),
    })
  } catch (err: any) {
    console.error("Erro no dashboard:", err.message)
    return NextResponse.json({
      kpis: { total_lines: 0, pending_alerts: 0, resolved_today: 0, resolved_month: 0 },
      daily_alerts: [],
      by_operator: [],
      by_contract_type: [],
      db_error: err.message,
    }, { status: 500 })
  }
}
