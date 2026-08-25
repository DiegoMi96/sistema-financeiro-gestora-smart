import * as XLSX from "xlsx";
import { parseFlexibleDate, toISODate, daysBetween, hojeLocal } from "./dates";
import type { EstoqueSnapshot, OperadoraEstoque, LoteInfo, LinhaEstoque, TipoEstoque } from "./types";

// Regra de classificação validada linha a linha contra o arquivo real do cliente:
//
// 1. `Status do bloqueio de rede` = "Suspenso" E `Data de início da suspensão` <= hoje
//      -> SUSPENSO
// 2. `Status do bloqueio de rede` = "Suspenso" MAS a data de início é futura
//      -> ATIVO (sub-contado como "aguardando suspensão" — ainda não foi de fato suspenso)
// 3. `Status` = "Suspenso" mas o bloqueio de rede não é "Suspenso" (linha órfã / desatualizada)
//      -> ATIVO
// 4. Nenhum dos casos acima -> usa `Status` diretamente (Ativo / Pré-ativo)

type RawRow = Record<string, unknown>;

// "SEM_DATA" cobre linhas com Status = Pré-ativo mas sem a data/prazo necessários
// para calcular o lote (falha de preenchimento na origem) — ainda assim entram
// no total, só não aparecem numa contagem regressiva.
type ClassificacaoLinha =
  | { bucket: "ATIVO"; aguardandoSuspensao: boolean }
  | { bucket: "PRE_ATIVO"; loteData: Date | "SEM_DATA"; prazoDias: number }
  | { bucket: "SUSPENSO"; loteData: Date; prazoDias: number };

function classificarLinha(row: RawRow, hoje: Date): ClassificacaoLinha | null {
  const bloqueio = String(row["Status do bloqueio de rede"] ?? "").trim();
  const status = String(row["Status"] ?? "").trim();

  if (bloqueio === "Suspenso") {
    const inicioSuspensao = parseFlexibleDate(row["Data de início da suspensão"]);
    if (inicioSuspensao && inicioSuspensao <= hoje) {
      return { bucket: "SUSPENSO", loteData: inicioSuspensao, prazoDias: 120 };
    }
    return { bucket: "ATIVO", aguardandoSuspensao: true };
  }

  if (status === "Suspenso") {
    // órfã: Status diz suspenso mas o bloqueio de rede não confirma -> tratar como ativo
    return { bucket: "ATIVO", aguardandoSuspensao: false };
  }

  if (status === "Pré-ativo") {
    const fimPreAtivacao = parseFlexibleDate(row["Data fim da pré-ativação"]);
    const prazoDias = Number(row["Dias de pré-ativação"]) || 0;
    if (!fimPreAtivacao || !prazoDias) {
      // dado incompleto na origem: conta no total mesmo sem conseguir calcular o lote
      return { bucket: "PRE_ATIVO", loteData: "SEM_DATA", prazoDias };
    }
    const loteData = new Date(fimPreAtivacao);
    loteData.setDate(loteData.getDate() - prazoDias);
    return { bucket: "PRE_ATIVO", loteData, prazoDias };
  }

  if (status === "Ativo") {
    return { bucket: "ATIVO", aguardandoSuspensao: false };
  }

  return null; // status desconhecido/vazio -> não classifica
}

type Acumulador = {
  ativosTotal: number;
  aguardandoSuspensao: number;
  preAtivosLotes: Map<string, { quantidade: number; prazoDias: number }>;
  suspensosLotes: Map<string, { quantidade: number; prazoDias: number }>;
};

function novoAcumulador(): Acumulador {
  return {
    ativosTotal: 0,
    aguardandoSuspensao: 0,
    preAtivosLotes: new Map(),
    suspensosLotes: new Map(),
  };
}

function lotesMapParaArray(map: Map<string, { quantidade: number; prazoDias: number }>): LoteInfo[] {
  return Array.from(map.entries())
    .map(([data, v]) => ({ data, quantidade: v.quantidade, prazoDias: v.prazoDias }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

// Colunas realmente usadas por classificarLinha/linhaBase — ver função abaixo.
// O parser CSV (parseEstoqueCsv) só materializa estas, pra não repetir o
// problema de memória do XLSX.read (que monta as ~58 colunas da planilha
// original inteiras antes de qualquer filtro ser possível).
const COLUNAS_NECESSARIAS = [
  "Operadora específica",
  "Status",
  "Status do bloqueio de rede",
  "Data de início da suspensão",
  "Data fim da pré-ativação",
  "Dias de pré-ativação",
  "MSISDN",
  "ICCID",
  "Nome do cliente",
  "Apelido",
] as const;

function processarLinhas(rows: Iterable<RawRow>, tipo: TipoEstoque): EstoqueSnapshot {
  const hoje = hojeLocal();

  const porOperadora = new Map<string, Acumulador>();
  const linhas: LinhaEstoque[] = [];
  let totalLinhas = 0;

  for (const row of rows) {
    totalLinhas++;
    const operadora = String(row["Operadora específica"] ?? "").trim();
    if (!operadora) continue;

    const classificacao = classificarLinha(row, hoje);
    if (!classificacao) continue;

    if (!porOperadora.has(operadora)) porOperadora.set(operadora, novoAcumulador());
    const acc = porOperadora.get(operadora)!;

    const linhaBase = {
      operadora,
      msisdn: String(row["MSISDN"] ?? "").trim(),
      iccid: String(row["ICCID"] ?? "").trim(),
      cliente: String(row["Nome do cliente"] ?? "").trim(),
      apelido: String(row["Apelido"] ?? "").trim(),
    };

    if (classificacao.bucket === "ATIVO") {
      acc.ativosTotal += 1;
      if (classificacao.aguardandoSuspensao) acc.aguardandoSuspensao += 1;
      linhas.push({
        ...linhaBase,
        bucket: "ATIVO",
        aguardandoSuspensao: classificacao.aguardandoSuspensao,
        loteData: "",
        prazoDias: 0,
      });
    } else if (classificacao.bucket === "PRE_ATIVO") {
      const key = classificacao.loteData === "SEM_DATA" ? "SEM_DATA" : toISODate(classificacao.loteData);
      const existing = acc.preAtivosLotes.get(key);
      acc.preAtivosLotes.set(key, {
        quantidade: (existing?.quantidade ?? 0) + 1,
        prazoDias: classificacao.prazoDias,
      });
      linhas.push({
        ...linhaBase,
        bucket: "PRE_ATIVO",
        aguardandoSuspensao: false,
        loteData: key,
        prazoDias: classificacao.prazoDias,
      });
    } else {
      const key = toISODate(classificacao.loteData);
      const existing = acc.suspensosLotes.get(key);
      acc.suspensosLotes.set(key, {
        quantidade: (existing?.quantidade ?? 0) + 1,
        prazoDias: classificacao.prazoDias,
      });
      linhas.push({
        ...linhaBase,
        bucket: "SUSPENSO",
        aguardandoSuspensao: false,
        loteData: key,
        prazoDias: classificacao.prazoDias,
      });
    }
  }

  const operadoras: OperadoraEstoque[] = Array.from(porOperadora.entries())
    .map(([operadora, acc]) => {
      const preAtivosTotal = Array.from(acc.preAtivosLotes.values()).reduce((s, v) => s + v.quantidade, 0);
      const suspensosTotal = Array.from(acc.suspensosLotes.values()).reduce((s, v) => s + v.quantidade, 0);
      return {
        operadora,
        ativos: { total: acc.ativosTotal, aguardandoSuspensao: acc.aguardandoSuspensao },
        preAtivos: { total: preAtivosTotal, lotes: lotesMapParaArray(acc.preAtivosLotes) },
        suspensos: { total: suspensosTotal, lotes: lotesMapParaArray(acc.suspensosLotes) },
        totalGeral: acc.ativosTotal + preAtivosTotal + suspensosTotal,
      };
    })
    .sort((a, b) => b.totalGeral - a.totalGeral);

  return {
    tipo,
    geradoEm: new Date().toISOString(),
    totalLinhas,
    operadoras,
    linhas,
  };
}

export function parseEstoque(fileBuffer: ArrayBuffer, tipo: TipoEstoque): EstoqueSnapshot {
  const workbook = XLSX.read(fileBuffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: RawRow[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return processarLinhas(rows, tipo);
}

// Mesmo parser RFC4180 usado em lib/csv.ts, mas em formato gerador: nunca
// materializa a planilha inteira em memória (nem as ~58 colunas originais,
// nem as 36 mil linhas de uma vez) — só entrega, uma linha por vez, um objeto
// com as colunas de COLUNAS_NECESSARIAS. Existe por causa do XLSX.read, que
// consome ~800MB+ em arquivos grandes (SMT) antes de qualquer filtro ser
// possível: convertendo pra CSV antes do upload, evita-se esse parser pesado.
function* linhasCsv(text: string): Generator<RawRow> {
  let campos: string[] = [];
  let field = "";
  let inQuotes = false;
  let colunaPorIndice: (string | null)[] | null = null;

  function fecharCampo() {
    campos.push(field);
    field = "";
  }

  function fecharLinha(): RawRow | null {
    fecharCampo();
    const linhaAtual = campos;
    campos = [];
    if (linhaAtual.length === 1 && linhaAtual[0] === "") return null;

    if (!colunaPorIndice) {
      colunaPorIndice = linhaAtual.map((h) =>
        (COLUNAS_NECESSARIAS as readonly string[]).includes(h) ? h : null
      );
      return null;
    }

    const row: RawRow = {};
    for (const campo of COLUNAS_NECESSARIAS) row[campo] = "";
    colunaPorIndice.forEach((campo, i) => {
      if (campo) row[campo] = linhaAtual[i] ?? "";
    });
    return row;
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ",") fecharCampo();
    else if (char === "\r") {
      // ignorado — a quebra de linha real é tratada no \n
    } else if (char === "\n") {
      const linha = fecharLinha();
      if (linha) yield linha;
    } else field += char;
  }
  if (field.length > 0 || campos.length > 0) {
    const linha = fecharLinha();
    if (linha) yield linha;
  }
}

export function parseEstoqueCsv(text: string, tipo: TipoEstoque): EstoqueSnapshot {
  return processarLinhas(linhasCsv(text), tipo);
}

export function diasRestantes(lote: LoteInfo, hoje: Date = hojeLocal()): number | null {
  if (lote.data === "SEM_DATA") return null;
  const loteData = parseFlexibleDate(lote.data);
  if (!loteData) return null;
  const decorridos = daysBetween(loteData, hoje);
  return lote.prazoDias - decorridos;
}
