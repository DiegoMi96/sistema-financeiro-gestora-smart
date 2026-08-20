import type { SaidaSnapshot, MovimentacaoLinha } from "./types";
import { hojeLocal } from "./dates";

function anoMesDe(dataISO: string | null): { ano: number; mes: number } | null {
  if (!dataISO) return null;
  const [y, m] = dataISO.split("-");
  return { ano: Number(y), mes: Number(m) };
}

export type SaidaDashboardViewModel = {
  atualizadoEm: string | null;
  totalExpedidoMes: number;
  totalExpedidoAno: number;
  totalExpedidoGeral: number;
  pedidosPendentes: number;
  aguardandoRetornoReenvio: number;
  reenviadosTotal: number;
  tendenciaMensal: { ano: number; mes: number; total: number }[];
  porOperadora: { operadora: string; total: number }[];
};

function ultimosMeses(hoje: Date, quantidade: number): { ano: number; mes: number }[] {
  const out: { ano: number; mes: number }[] = [];
  let y = hoje.getUTCFullYear();
  let m = hoje.getUTCMonth() + 1;
  for (let i = 0; i < quantidade; i++) {
    out.unshift({ ano: y, mes: m });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

export function buildSaidaDashboard(snapshot: SaidaSnapshot | null, pedidosPendentes: number): SaidaDashboardViewModel {
  const movimentacao = snapshot?.movimentacao ?? [];
  const hoje = hojeLocal();
  const anoAtual = hoje.getUTCFullYear();
  const mesAtual = hoje.getUTCMonth() + 1;

  let totalExpedidoMes = 0;
  let totalExpedidoAno = 0;
  let totalExpedidoGeral = 0;
  const porOperadoraMap = new Map<string, number>();

  for (const linha of movimentacao) {
    totalExpedidoGeral += linha.quantidade;
    porOperadoraMap.set(linha.operadora, (porOperadoraMap.get(linha.operadora) ?? 0) + linha.quantidade);

    const am = anoMesDe(linha.dataSaida);
    if (am?.ano === anoAtual) {
      totalExpedidoAno += linha.quantidade;
      if (am.mes === mesAtual) totalExpedidoMes += linha.quantidade;
    }
  }

  const tendenciaMensal = ultimosMeses(hoje, 12).map(({ ano, mes }) => {
    const total = movimentacao
      .filter((l) => {
        const am = anoMesDe(l.dataSaida);
        return am?.ano === ano && am?.mes === mes;
      })
      .reduce((s, l) => s + l.quantidade, 0);
    return { ano, mes, total };
  });

  const retornos = snapshot?.retornos ?? [];
  const aguardandoRetornoReenvio = retornos.filter(
    (r) => r.status.trim().toLowerCase() === "aguardando reenvio"
  ).length;
  const reenviadosTotal = retornos.filter((r) => r.status.trim().toLowerCase() === "reenviado").length;

  const porOperadora = Array.from(porOperadoraMap.entries())
    .map(([operadora, total]) => ({ operadora, total }))
    .sort((a, b) => b.total - a.total);

  return {
    atualizadoEm: snapshot?.geradoEm ?? null,
    totalExpedidoMes,
    totalExpedidoAno,
    totalExpedidoGeral,
    pedidosPendentes,
    aguardandoRetornoReenvio,
    reenviadosTotal,
    tendenciaMensal,
    porOperadora,
  };
}

export type SaidaResumoViewModel = {
  ano: number;
  mes: number;
  diasNoMes: number;
  operadoras: { operadora: string; porDia: number[]; total: number }[];
  totalPorDia: number[];
  totalGeral: number;
};

export function buildSaidaResumo(snapshot: SaidaSnapshot | null, ano: number, mes: number): SaidaResumoViewModel {
  const movimentacao = snapshot?.movimentacao ?? [];
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

  const doMes = movimentacao.filter((l) => {
    const am = anoMesDe(l.dataSaida);
    return am?.ano === ano && am?.mes === mes;
  });

  const operadorasSet = Array.from(new Set(doMes.map((l) => l.operadora))).sort();

  const operadoras = operadorasSet.map((operadora) => {
    const porDia = new Array(diasNoMes).fill(0);
    for (const l of doMes) {
      if (l.operadora !== operadora || !l.dataSaida) continue;
      const dia = Number(l.dataSaida.split("-")[2]);
      porDia[dia - 1] += l.quantidade;
    }
    return { operadora, porDia, total: porDia.reduce((s, v) => s + v, 0) };
  });

  const totalPorDia = new Array(diasNoMes).fill(0);
  for (const op of operadoras) {
    op.porDia.forEach((v, i) => (totalPorDia[i] += v));
  }

  return {
    ano,
    mes,
    diasNoMes,
    operadoras,
    totalPorDia,
    totalGeral: totalPorDia.reduce((s, v) => s + v, 0),
  };
}

export type SaidaDoDiaViewModel = {
  data: string | null;
  linhas: MovimentacaoLinha[];
};

export function buildSaidaDoDia(snapshot: SaidaSnapshot | null, dataEspecifica?: string): SaidaDoDiaViewModel {
  const movimentacao = snapshot?.movimentacao ?? [];

  let data = dataEspecifica ?? null;
  if (!data) {
    const datas = movimentacao.map((l) => l.dataSaida).filter((d): d is string => Boolean(d));
    data = datas.length > 0 ? datas.sort().at(-1)! : null;
  }

  const linhas = data
    ? movimentacao
        .filter((l) => l.dataSaida === data)
        .sort((a, b) => a.pedidoId.localeCompare(b.pedidoId))
    : [];

  return { data, linhas };
}
