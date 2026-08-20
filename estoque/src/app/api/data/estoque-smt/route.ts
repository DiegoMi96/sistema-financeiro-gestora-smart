import { getState } from "@/lib/store";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const state = await getState();
  return Response.json({ snapshot: state.estoqueSmt });
}
