import { parseCsv } from "./csv";
import { buildCancelamentoSnapshot } from "./parseCancelamento";
import { buildSaidaSnapshot } from "./parseSaida";
import type { CancelamentoSnapshot, SaidaSnapshot } from "./types";

// As planilhas de backlog de cancelamento e controle de saída são públicas
// ("qualquer pessoa com o link"), então basta os endpoints de exportação em
// CSV do Google Sheets — sem credenciais. Se algum dia precisarem ficar
// privadas de novo, troque por uma conta de serviço do Google (Sheets API
// v4) sem mexer no restante do app — só a função de fetch muda.
const CANCELAMENTO_SHEET_ID = process.env.CANCELAMENTO_SHEET_ID;
const SAIDA_SHEET_ID = process.env.SAIDA_SHEET_ID;

async function fetchCsv(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Não foi possível acessar a planilha do Google Sheets (status ${res.status}). Verifique se ela ainda está compartilhada como "Qualquer pessoa com o link".`
    );
  }
  return res.text();
}

function csvExportUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
}

// gviz permite pegar uma aba específica pelo nome (e, opcionalmente, um
// range) — necessário porque o endpoint de /export simples só devolve a
// primeira aba, e nossas planilhas têm mais de uma.
function gvizTabUrl(sheetId: string, sheetName: string, range?: string): string {
  const params = new URLSearchParams({ tqx: "out:csv", sheet: sheetName });
  if (range) params.set("range", range);
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.toString()}`;
}

export async function fetchCancelamentoSnapshot(): Promise<CancelamentoSnapshot> {
  if (!CANCELAMENTO_SHEET_ID) {
    throw new Error("CANCELAMENTO_SHEET_ID não configurado (.env.local).");
  }
  const csvText = await fetchCsv(csvExportUrl(CANCELAMENTO_SHEET_ID));
  return buildCancelamentoSnapshot(parseCsv(csvText));
}

export async function fetchSaidaSnapshot(): Promise<SaidaSnapshot> {
  if (!SAIDA_SHEET_ID) {
    throw new Error("SAIDA_SHEET_ID não configurado (.env.local).");
  }

  const [movCsv, retCsv] = await Promise.all([
    fetchCsv(gvizTabUrl(SAIDA_SHEET_ID, "Movimentação")),
    // Cabeçalho real da aba de retornos fica na linha 4 (título + instrução acima).
    fetchCsv(gvizTabUrl(SAIDA_SHEET_ID, "Retorno e Reenviados", "A4:L")),
  ]);

  return buildSaidaSnapshot(parseCsv(movCsv), parseCsv(retCsv));
}

type FetchResult<T> = { ok: true; snapshot: T } | { ok: false; erro: string };

async function safe<T>(fn: () => Promise<T>): Promise<FetchResult<T>> {
  try {
    return { ok: true, snapshot: await fn() };
  } catch (error) {
    return { ok: false, erro: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

export type CancelamentoFetchResult = FetchResult<CancelamentoSnapshot>;
export type SaidaFetchResult = FetchResult<SaidaSnapshot>;

export async function fetchCancelamentoSnapshotSafe(): Promise<CancelamentoFetchResult> {
  return safe(fetchCancelamentoSnapshot);
}

export async function fetchSaidaSnapshotSafe(): Promise<SaidaFetchResult> {
  return safe(fetchSaidaSnapshot);
}
