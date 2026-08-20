import { fetchSaidaSnapshotSafe } from "@/lib/googleSheets";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const resultado = await fetchSaidaSnapshotSafe();
  if (!resultado.ok) {
    return Response.json({ ok: false, erro: resultado.erro });
  }
  const retornos = [...resultado.snapshot.retornos].sort((a, b) =>
    (b.dataRetorno ?? "").localeCompare(a.dataRetorno ?? "")
  );
  return Response.json({ ok: true, retornos });
}
