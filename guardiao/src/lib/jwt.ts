import { SignJWT, jwtVerify } from "jose"

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "guardiao-secret-key-change-in-production"
)

export async function signToken(payload: { sub: string; role: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(SECRET)
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as { sub: string; role: string }
  } catch {
    return null
  }
}

export function extractToken(authHeader: string | null) {
  if (!authHeader) return null
  return authHeader.replace(/^Bearer\s+/i, "").trim()
}
