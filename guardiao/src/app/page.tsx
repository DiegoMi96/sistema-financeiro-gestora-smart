import { redirect } from 'next/navigation'

// Integração 31/07/2026: sem isto, o Next.js trata esta página (só um
// redirect incondicional) como estática e a resposta cacheada no build vem
// no formato interno de navegação client-side (RSC), sem Location HTTP —
// quebra o acesso direto/primeira carga via nginx (atrás de proxy_pass).
// force-dynamic recalcula por requisição, gerando um redirect HTTP normal.
export const dynamic = 'force-dynamic'

export default function Home() {
  redirect('/dashboard')
}
