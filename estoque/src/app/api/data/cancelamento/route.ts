import { fetchCancelamentoSnapshotSafe } from "@/lib/googleSheets";
import { buildCancelamentoResumo, buildCancelamentoGeral } from "@/lib/aggregateCancelamento";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const resultado = await fetchCancelamentoSnapshotSafe();
  if (!resultado.ok) {
    return Response.json({ ok: false, erro: resultado.erro });
  }
  const snapshot = resultado.snapshot;
  return Response.json({
    ok: true,
    snapshot,
    vm: buildCancelamentoResumo(snapshot),
    geral: buildCancelamentoGeral(snapshot),
  });
}
