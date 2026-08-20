import { getState } from "@/lib/store";
import { fetchSaidaSnapshotSafe } from "@/lib/googleSheets";
import { buildSaidaDashboard } from "@/lib/aggregateSaida";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const [state, resultado] = await Promise.all([getState(), fetchSaidaSnapshotSafe()]);
  if (!resultado.ok) {
    return Response.json({ ok: false, erro: resultado.erro });
  }
  return Response.json({ ok: true, vm: buildSaidaDashboard(resultado.snapshot, state.pedidos?.totalPedidos ?? 0) });
}
