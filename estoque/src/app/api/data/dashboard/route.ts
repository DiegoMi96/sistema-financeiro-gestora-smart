import { getState } from "@/lib/store";
import { buildDashboard } from "@/lib/aggregate";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const state = await getState();
  if (!state.estoqueSmart && !state.estoqueSmt && !state.pedidos) {
    return Response.json({ empty: true });
  }
  return Response.json({ empty: false, vm: buildDashboard(state) });
}
