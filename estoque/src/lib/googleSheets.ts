import { parseCsv } from "./csv";
import { buildCancelamentoSnapshot } from "./parseCancelamento";
import { buildSaidaSnapshot } from "./parseSaida";
import { getConfiguracaoSheets } from "./store";
import type { CancelamentoSnapshot, SaidaSnapshot } from "./types";

// As planilhas de backlog de cancelamento e controle de saída são públicas
// ("qualquer pessoa com o link"), então basta os endpoints de exportação em
// CSV do Google Sheets — sem credenciais. Se algum dia precisarem ficar
// privadas de novo, troque por uma conta de serviço do Google (Sheets API
// v4) sem mexer no restante do app — só a função de fetch muda.
//
// O ID de cada planilha vem, em ordem de prioridade, da tela de
// Configurações (banco, via getConfiguracaoSheets) e, se ainda não tiver
// sido configurado por lá, da variável de ambiente (compatibilidade com a
// configuração antiga, que exigia redeploy pra trocar).
async function resolverSheetId(
  campo: keyof Awaited<ReturnType<typeof getConfiguracaoSheets>>,
  envFallback: string | undefined
): Promise<string | null> {
  const config = await getConfiguracaoSheets();
  return config[campo] || envFallback || null;
}

// Aceita tanto o ID puro quanto o link completo colado da barra de
// endereços (".../spreadsheets/d/ESSE_TRECHO/edit?...").
export function extrairSheetId(valor: string): string | null {
  const texto = valor.trim();
  if (!texto) return null;
  const match = texto.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(texto)) return texto;
  return null;
}

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
  const sheetId = await resolverSheetId("cancelamentoSheetId", process.env.CANCELAMENTO_SHEET_ID);
  if (!sheetId) {
    throw new Error("Planilha do Cancelamento não configurada. Configure em Configurações.");
  }
  const csvText = await fetchCsv(csvExportUrl(sheetId));
  return buildCancelamentoSnapshot(parseCsv(csvText));
}

export async function fetchSaidaSnapshot(): Promise<SaidaSnapshot> {
  const sheetId = await resolverSheetId("saidaSheetId", process.env.SAIDA_SHEET_ID);
  if (!sheetId) {
    throw new Error("Planilha da Saída não configurada. Configure em Configurações.");
  }

  const [movCsv, retCsv] = await Promise.all([
    fetchCsv(gvizTabUrl(sheetId, "Movimentação")),
    // Cabeçalho real da aba de retornos fica na linha 4 (título + instrução acima).
    fetchCsv(gvizTabUrl(sheetId, "Retorno e Reenviados", "A4:L")),
  ]);

  return buildSaidaSnapshot(parseCsv(movCsv), parseCsv(retCsv));
}

// Usado pelo botão "Testar conexão" da tela de Configurações: só confirma
// que a planilha responde com algum conteúdo, sem validar colunas.
export async function testarConexaoSheet(
  campo: "cancelamento" | "saida",
  valorColado: string
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const sheetId = extrairSheetId(valorColado);
  if (!sheetId) {
    return { ok: false, erro: "Link ou ID da planilha inválido." };
  }
  try {
    const csvText =
      campo === "cancelamento" ? await fetchCsv(csvExportUrl(sheetId)) : await fetchCsv(gvizTabUrl(sheetId, "Movimentação"));
    if (!csvText.trim()) {
      return { ok: false, erro: "A planilha respondeu vazia." };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, erro: error instanceof Error ? error.message : "Erro desconhecido" };
  }
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
