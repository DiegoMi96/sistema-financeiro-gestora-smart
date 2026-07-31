// Ponte de autenticação com o sistema principal (gestora-smart).
// Login unificado: o Guardião deixa de ter login próprio (ver jwt.ts, agora
// não utilizado) e passa a validar o MESMO token JWT emitido pelo backend
// principal. GESTORA_JWT_SECRET precisa ser IDÊNTICA à SECRET_KEY do backend
// principal (backend/app/config.py) — mesmo algoritmo HS256, mesma chave.
// Criado em 31/07/2026 durante a integração do Guardião ao sistema principal.
import { jwtVerify } from "jose"

const SECRET = new TextEncoder().encode(process.env.GESTORA_JWT_SECRET ?? "")

export interface MainTokenPayload {
  sub: string
  role: string
}

export async function verifyMainToken(token: string): Promise<MainTokenPayload | null> {
  if (!process.env.GESTORA_JWT_SECRET) {
    console.error("[mainAuth] GESTORA_JWT_SECRET não definida")
    return null
  }
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as MainTokenPayload
  } catch {
    return null
  }
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  return authHeader.replace(/^Bearer\s+/i, "").trim()
}

/** Exige um token válido do sistema principal. Retorna o payload ou null. */
export async function requireMainAuth(request: Request): Promise<MainTokenPayload | null> {
  const token = extractBearerToken(request.headers.get("Authorization"))
  if (!token) return null
  return verifyMainToken(token)
}

/** Resposta 401 padrão para rotas sem autenticação válida. */
export function unauthorizedResponse() {
  return new Response(JSON.stringify({ detail: "Não autorizado." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  })
}
