import type { CancelamentoSnapshot } from "./types";
import { parseFlexibleDate, daysBetween, hojeLocal, adicionarMeses } from "./dates";

const FIDELIDADE_MULTA_CONTRATO = "MULTA NO VALOR DO CONTRATO";
const MESES_FIDELIDADE_PADRAO = 12;
const MESES_FIDELIDADE_CLARO = 24;

export function diasRestantesPrazo(prazoISO: string, hoje: Date = hojeLocal()): number {
  const prazoData = parseFlexibleDate(prazoISO)!;
  return daysBetween(hoje, prazoData);
}

export type CancelamentoResumoViewModel = {
  atualizadoEm: string | null;
  totalLinhas: number;
  totalConcluidos: number;
  porStatus: { status: string; total: number }[];
  vencidos: number; // dias restantes < 0
  vencendoEm7Dias: number; // 0 <= dias restantes <= 7
};

export function buildCancelamentoResumo(snapshot: CancelamentoSnapshot | null): CancelamentoResumoViewModel {
  if (!snapshot) {
    return { atualizadoEm: null, totalLinhas: 0, totalConcluidos: 0, porStatus: [], vencidos: 0, vencendoEm7Dias: 0 };
  }

  const hoje = hojeLocal();
  const pendentes = snapshot.linhas.filter((l) => !l.dataCancelamento);
  const porStatusMap = new Map<string, number>();
  let vencidos = 0;
  let vencendoEm7Dias = 0;

  for (const linha of pendentes) {
    porStatusMap.set(linha.status, (porStatusMap.get(linha.status) ?? 0) + 1);
    const dias = diasRestantesPrazo(linha.prazo, hoje);
    if (dias < 0) vencidos += 1;
    else if (dias <= 7) vencendoEm7Dias += 1;
  }

  const porStatus = Array.from(porStatusMap.entries())
    .map(([status, total]) => ({ status, total }))
    .sort((a, b) => b.total - a.total);

  return {
    atualizadoEm: snapshot.geradoEm,
    totalLinhas: snapshot.totalLinhas,
    totalConcluidos: snapshot.totalConcluidos,
    porStatus,
    vencidos,
    vencendoEm7Dias,
  };
}

export type CancelamentoGeralViewModel = {
  meses: string[]; // "YYYY-MM", ordenado
  operadoras: string[];
  porMesOperadora: Record<string, Record<string, number>>;
  totalPorMes: Record<string, number>;
  totalPorOperadora: Record<string, number>;
  totalGeral: number;
};

// Visão consolidada: todas as operadoras em colunas, um mês por linha —
// "em Agosto tem X linhas pra cancelar, divididas assim entre operadoras".
export function buildCancelamentoGeral(snapshot: CancelamentoSnapshot | null): CancelamentoGeralViewModel {
  if (!snapshot) {
    return { meses: [], operadoras: [], porMesOperadora: {}, totalPorMes: {}, totalPorOperadora: {}, totalGeral: 0 };
  }

  const mesesSet = new Set<string>();
  const operadorasSet = new Set<string>();
  const porMesOperadora: Record<string, Record<string, number>> = {};

  for (const l of snapshot.linhas) {
    if (l.dataCancelamento) continue; // já concluído, não é mais backlog
    const mes = l.prazo.slice(0, 7);
    mesesSet.add(mes);
    operadorasSet.add(l.operadora);
    porMesOperadora[mes] ??= {};
    porMesOperadora[mes][l.operadora] = (porMesOperadora[mes][l.operadora] ?? 0) + 1;
  }

  const meses = Array.from(mesesSet).sort();
  const operadoras = Array.from(operadorasSet).sort();

  const totalPorMes: Record<string, number> = {};
  const totalPorOperadora: Record<string, number> = {};
  let totalGeral = 0;

  for (const mes of meses) {
    let somaMes = 0;
    for (const operadora of operadoras) {
      const valor = porMesOperadora[mes]?.[operadora] ?? 0;
      somaMes += valor;
      totalPorOperadora[operadora] = (totalPorOperadora[operadora] ?? 0) + valor;
    }
    totalPorMes[mes] = somaMes;
    totalGeral += somaMes;
  }

  return { meses, operadoras, porMesOperadora, totalPorMes, totalPorOperadora, totalGeral };
}

export type MultaContratualItem = {
  msisdn: string;
  iccid: string;
  operadora: string;
  status: string;
  dataAtivacao: string;
  dataFimFidelidade: string;
  diasRestantes: number; // negativo = fidelidade já terminou (cancelar não gera multa)
};

export type MultaContratualViewModel = {
  atualizadoEm: string | null;
  total: number;
  dentroDaFidelidade: number; // diasRestantes >= 0 — cancelar agora gera multa
  foraDaFidelidade: number; // diasRestantes < 0 — já pode cancelar sem multa
  itens: MultaContratualItem[];
};

// "MULTA NO VALOR DO CONTRATO" — linhas de alto impacto financeiro: cancelar
// antes do fim da fidelidade (12 meses da ativação, 24 para CLARO) gera multa
// no valor do contrato inteiro.
export function buildMultaContratual(snapshot: CancelamentoSnapshot | null): MultaContratualViewModel {
  if (!snapshot) {
    return { atualizadoEm: null, total: 0, dentroDaFidelidade: 0, foraDaFidelidade: 0, itens: [] };
  }

  const hoje = hojeLocal();
  const itens: MultaContratualItem[] = [];

  for (const l of snapshot.linhas) {
    if (l.dataCancelamento) continue; // já concluído, não é mais uma decisão pendente
    if (l.fidelidade.trim().toUpperCase() !== FIDELIDADE_MULTA_CONTRATO || !l.dataAtivacao) continue;

    const meses = l.operadora.trim().toUpperCase() === "CLARO" ? MESES_FIDELIDADE_CLARO : MESES_FIDELIDADE_PADRAO;
    const dataFimFidelidade = adicionarMeses(l.dataAtivacao, meses);
    const diasRestantes = daysBetween(hoje, parseFlexibleDate(dataFimFidelidade)!);

    itens.push({
      msisdn: l.msisdn,
      iccid: l.iccid,
      operadora: l.operadora,
      status: l.status,
      dataAtivacao: l.dataAtivacao,
      dataFimFidelidade,
      diasRestantes,
    });
  }

  itens.sort((a, b) => a.diasRestantes - b.diasRestantes);

  return {
    atualizadoEm: snapshot.geradoEm,
    total: itens.length,
    dentroDaFidelidade: itens.filter((i) => i.diasRestantes >= 0).length,
    foraDaFidelidade: itens.filter((i) => i.diasRestantes < 0).length,
    itens,
  };
}
