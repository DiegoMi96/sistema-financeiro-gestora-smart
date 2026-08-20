import { getState } from "@/lib/store";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const state = await getState();
  return Response.json({
    estoqueSmart: state.estoqueSmart
      ? { geradoEm: state.estoqueSmart.geradoEm, totalLinhas: state.estoqueSmart.totalLinhas }
      : null,
    estoqueSmt: state.estoqueSmt
      ? { geradoEm: state.estoqueSmt.geradoEm, totalLinhas: state.estoqueSmt.totalLinhas }
      : null,
    pedidos: state.pedidos
      ? { geradoEm: state.pedidos.geradoEm, totalPedidos: state.pedidos.totalPedidos }
      : null,
  });
}
