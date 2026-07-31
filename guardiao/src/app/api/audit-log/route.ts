import { NextRequest, NextResponse } from "next/server"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export async function GET(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  return NextResponse.json({
    logs: [
      { id: "l1", user_id: "00000000-0000-0000-0000-000000000001", action: "snapshot_uploaded",  entity_type: "snapshot", entity_id: "s1", changes_summary: "Importados 347 linhas, 4 alertas gerados",    timestamp: "2024-06-16T09:00:00" },
      { id: "l2", user_id: "00000000-0000-0000-0000-000000000002", action: "alert_resolved",     entity_type: "alert",    entity_id: "a5", changes_summary: "Alerta marcado como concluído com notas",       timestamp: "2024-06-14T11:00:00" },
      { id: "l3", user_id: "00000000-0000-0000-0000-000000000001", action: "snapshot_uploaded",  entity_type: "snapshot", entity_id: "s2", changes_summary: "Importados 341 linhas, 3 alertas gerados",    timestamp: "2024-06-15T09:15:00" },
      { id: "l4", user_id: "00000000-0000-0000-0000-000000000002", action: "alert_resolved",     entity_type: "alert",    entity_id: "a6", changes_summary: "Alerta marcado como concluído",                 timestamp: "2024-06-13T14:00:00" },
      { id: "l5", user_id: "00000000-0000-0000-0000-000000000001", action: "rule_updated",       entity_type: "rule",     entity_id: "r1", changes_summary: "Threshold individual alterado de 100% para 100%", timestamp: "2024-06-12T16:00:00" },
      { id: "l6", user_id: "00000000-0000-0000-0000-000000000003", action: "user_login",         entity_type: "user",     entity_id: "00000000-0000-0000-0000-000000000003", changes_summary: "Login realizado", timestamp: "2024-06-14T10:00:00" },
    ],
    total: 6,
  })
}
