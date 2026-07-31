// Mapeia o papel do usuário no sistema principal (gestora-smart: admin,
// gestor, contas_receber, suporte_tecnico, ou papel personalizado) para o
// papel que o Guardião entende internamente (admin | analyst | viewer).
//
// Decisão tomada em 31/07/2026 durante a integração (sem sistema de
// permissões finas para o Guardião ainda) — ajustar aqui se o Diego/Thalles
// quiserem regras mais específicas por usuário.
export type GuardiaoRole = "admin" | "analyst" | "viewer"

export function mapMainRoleToGuardiao(mainRole: string): GuardiaoRole {
  switch (mainRole) {
    case "admin":
    case "gestor":
      return "admin"
    case "contas_receber":
      return "analyst"
    default:
      return "viewer"
  }
}
