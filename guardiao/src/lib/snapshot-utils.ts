import { sql } from "./db"

export function getCurrentCompetencia() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export async function updateSnapshotCounters(delta: { pending?: number; resolved?: number }) {
  const competencia = getCurrentCompetencia()

  const [latest] = await sql`SELECT id FROM snapshots ORDER BY imported_at DESC LIMIT 1`
  if (!latest) return

  if (delta.pending !== undefined) {
    await sql`
      UPDATE snapshots
      SET pending_day = GREATEST(0, pending_day + ${delta.pending})
      WHERE id = ${latest.id}
    `
  }

  if (delta.resolved !== undefined && delta.resolved > 0) {
    await sql`
      UPDATE snapshots
      SET resolved_day = resolved_day + ${delta.resolved}
      WHERE id = ${latest.id}
    `

    // Recalcula total do mês somando todos os resolved_day do mês corrente
    await sql`
      UPDATE snapshots s
      SET resolved_month = (
        SELECT COALESCE(SUM(resolved_day), 0)
        FROM snapshots
        WHERE competencia = ${competencia}
      )
      WHERE id = ${latest.id}
    `
  }
}
