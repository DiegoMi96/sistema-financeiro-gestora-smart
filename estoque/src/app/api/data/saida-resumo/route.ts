import { fetchSaidaSnapshotSafe } from "@/lib/googleSheets";
import { buildSaidaResumo } from "@/lib/aggregateSaida";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const url = new URL(request.url);
  const hoje = new Date();
  const ano = Number(url.searchParams.get("ano")) || hoje.getFullYear();
  const mes = Number(url.searchParams.get("mes")) || hoje.getMonth() + 1;

  const resultado = await fetchSaidaSnapshotSafe();
  if (!resultado.ok) {
    return Response.json({ ok: false, erro: resultado.erro });
  }
  return Response.json({ ok: true, vm: buildSaidaResumo(resultado.snapshot, ano, mes) });
}
