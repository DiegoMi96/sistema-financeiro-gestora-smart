// Ponte de autenticação com o sistema principal (gestora-smart).
// O Controle de Estoque não tem login próprio: valida o MESMO token JWT
// emitido pelo backend principal. GESTORA_JWT_SECRET precisa ser IDÊNTICA à
// SECRET_KEY do backend principal (backend/app/config.py) — mesmo algoritmo
// HS256, mesma chave. Mesmo padrão usado na integração do Guardião
// (guardiao/src/lib/mainAuth.ts) em 31/07/2026.
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.GESTORA_JWT_SECRET ?? "");

export interface MainTokenPayload {
  sub: string;
  role: string;
}

export async function verifyMainToken(token: string): Promise<MainTokenPayload | null> {
  if (!process.env.GESTORA_JWT_SECRET) {
    console.error("[mainAuth] GESTORA_JWT_SECRET não definida");
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as MainTokenPayload;
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

// Papéis do sistema principal com acesso ao Controle de Estoque — mesmo
// conjunto que ganha o card na tela de módulos (can_view_estoque no backend
// principal, ver backend/app/core/permissions.py). Mantido em sincronia
// manualmente, igual ao roleMap do Guardião.
const ROLES_PERMITIDOS = new Set(["admin", "gestor"]);

/** Exige um token válido do sistema principal, com papel autorizado. Retorna o payload ou null. */
export async function requireMainAuth(request: Request): Promise<MainTokenPayload | null> {
  const token = extractBearerToken(request.headers.get("Authorization"));
  if (!token) return null;
  const payload = await verifyMainToken(token);
  if (!payload || !ROLES_PERMITIDOS.has(payload.role)) return null;
  return payload;
}

/** Resposta 401 padrão para rotas sem autenticação/autorização válida. */
export function unauthorizedResponse() {
  return new Response(JSON.stringify({ detail: "Não autorizado." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
