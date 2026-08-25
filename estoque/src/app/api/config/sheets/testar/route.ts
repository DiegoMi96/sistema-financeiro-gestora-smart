import { testarConexaoSheet } from "@/lib/googleSheets";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const body = await request.json();
  const campo = body.campo as "cancelamento" | "saida";
  const valor = String(body.valor ?? "").trim();

  if (campo !== "cancelamento" && campo !== "saida") {
    return Response.json({ ok: false, erro: "Campo inválido." }, { status: 400 });
  }

  const resultado = await testarConexaoSheet(campo, valor);
  return Response.json(resultado);
}
