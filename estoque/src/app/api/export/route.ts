import * as XLSX from "xlsx";
import { getState } from "@/lib/store";
import { diasRestantes } from "@/lib/parseEstoque";
import type { BucketEstoque, EstoqueSnapshot, LinhaEstoque, TipoEstoque } from "@/lib/types";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

const LABEL_BUCKET: Record<BucketEstoque, string> = {
  ATIVO: "Ativo",
  PRE_ATIVO: "Pré-ativo",
  SUSPENSO: "Suspenso",
};

function formatarLote(loteData: string): string {
  if (!loteData) return "-";
  if (loteData === "SEM_DATA") return "Sem data (origem)";
  const [y, m, d] = loteData.split("-");
  return `${d}/${m}/${y}`;
}

function nomeArquivo(tipo: string, operadora: string, bucket: string, lote: string): string {
  const partes = [tipo, operadora, bucket, lote !== "-" ? lote : ""]
    .filter(Boolean)
    .map((p) => p.replace(/[^a-zA-Z0-9À-ÿ]+/g, "_"));
  return `${partes.join("_")}.xlsx`;
}

export async function GET(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo") as TipoEstoque | null;
  const operadora = url.searchParams.get("operadora");
  const bucket = url.searchParams.get("bucket") as BucketEstoque | null;
  const lote = url.searchParams.get("lote") ?? ""; // ISO date, "SEM_DATA" ou "" (ativos)
  const aguardando = url.searchParams.get("aguardando"); // "true" | "false" | null

  if (!tipo || !operadora || !bucket) {
    return new Response("Parâmetros obrigatórios: tipo, operadora, bucket", { status: 400 });
  }

  const state = await getState();
  const snapshot: EstoqueSnapshot | null = tipo === "SMART" ? state.estoqueSmart : state.estoqueSmt;

  if (!snapshot) {
    return new Response("Nenhum arquivo importado para esse estoque.", { status: 404 });
  }

  let linhas: LinhaEstoque[] = snapshot.linhas.filter(
    (l) => l.operadora === operadora && l.bucket === bucket
  );

  if (bucket === "ATIVO") {
    if (aguardando === "true") linhas = linhas.filter((l) => l.aguardandoSuspensao);
    else if (aguardando === "false") linhas = linhas.filter((l) => !l.aguardandoSuspensao);
  } else {
    linhas = linhas.filter((l) => l.loteData === lote);
  }

  const hoje = new Date();
  const linhasOrdenadas = [...linhas].sort((a, b) => a.msisdn.localeCompare(b.msisdn));

  const dados = linhasOrdenadas.map((l) => ({
    Linha: l.msisdn,
    ICCID: l.iccid,
    Cliente: l.cliente,
    Apelido: l.apelido,
    Operadora: l.operadora,
    Status: l.bucket === "ATIVO" && l.aguardandoSuspensao ? "Ativo (aguardando suspensão)" : LABEL_BUCKET[l.bucket],
    "Data do lote": formatarLote(l.loteData),
    "Dias restantes":
      l.bucket === "ATIVO"
        ? "-"
        : diasRestantes({ data: l.loteData, quantidade: 1, prazoDias: l.prazoDias }, hoje) ?? "-",
  }));

  const worksheet = XLSX.utils.json_to_sheet(dados);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Linhas");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const filename = nomeArquivo(tipo, operadora, LABEL_BUCKET[bucket], formatarLote(lote));

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
