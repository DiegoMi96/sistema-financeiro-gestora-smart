import { setNovaCompra } from "@/lib/store";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

// Substitui a Server Action original (src/app/estoque-geral/actions.ts):
// Server Actions não carregam o header Authorization enviado pelo cliente,
// então não dava para autenticar por lá. Mesmo padrão de rota comum usado
// no resto da integração.
export async function POST(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const body = await request.json();
  const operadora = String(body.operadora ?? "").trim();
  const valor = Number(body.valor) || 0;
  if (!operadora) {
    return Response.json({ ok: false, erro: "Operadora obrigatória." }, { status: 400 });
  }

  await setNovaCompra(operadora, valor);
  return Response.json({ ok: true });
}
