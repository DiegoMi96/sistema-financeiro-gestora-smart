import { getConfiguracaoSheets, setConfiguracaoSheets } from "@/lib/store";
import { extrairSheetId } from "@/lib/googleSheets";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();
  const config = await getConfiguracaoSheets();
  return Response.json({ ok: true, config });
}

export async function POST(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const body = await request.json();
  const campo = body.campo as "cancelamento" | "saida";
  const valor = String(body.valor ?? "").trim();

  if (campo !== "cancelamento" && campo !== "saida") {
    return Response.json({ ok: false, erro: "Campo inválido." }, { status: 400 });
  }

  const sheetId = extrairSheetId(valor);
  if (!sheetId) {
    return Response.json({ ok: false, erro: "Link ou ID da planilha inválido." }, { status: 400 });
  }

  const chave = campo === "cancelamento" ? "cancelamentoSheetId" : "saidaSheetId";
  const config = await setConfiguracaoSheets({ [chave]: sheetId });
  return Response.json({ ok: true, config });
}
