import { fetchCancelamentoSnapshotSafe } from "@/lib/googleSheets";
import { buildMultaContratual } from "@/lib/aggregateCancelamento";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const resultado = await fetchCancelamentoSnapshotSafe();
  if (!resultado.ok) {
    return Response.json({ ok: false, erro: resultado.erro });
  }
  return Response.json({ ok: true, vm: buildMultaContratual(resultado.snapshot) });
}
