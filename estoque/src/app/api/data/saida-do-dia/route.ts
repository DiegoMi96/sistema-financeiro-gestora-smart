import { fetchSaidaSnapshotSafe } from "@/lib/googleSheets";
import { buildSaidaDoDia } from "@/lib/aggregateSaida";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const url = new URL(request.url);
  const data = url.searchParams.get("data") ?? undefined;

  const resultado = await fetchSaidaSnapshotSafe();
  if (!resultado.ok) {
    return Response.json({ ok: false, erro: resultado.erro });
  }
  return Response.json({ ok: true, vm: buildSaidaDoDia(resultado.snapshot, data) });
}
