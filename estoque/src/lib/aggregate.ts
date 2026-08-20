import type { AppState, EstoqueSnapshot, PedidoAgendado } from "./types";

export type DashboardConsolidadoLinha = {
  operadora: string;
  smart: number;
  smt: number;
  totalGeral: number;
};

export type DashboardIndicadorLinha = {
  operadora: string;
  ativos: number;
  preAtivos: number;
  suspensos: number;
  total: number;
};

export type DashboardViewModel = {
  atualizadoEm: string | null;
  consolidado: DashboardConsolidadoLinha[];
  totalConsolidado: { smart: number; smt: number; totalGeral: number };
  indicadoresSmart: DashboardIndicadorLinha[];
  indicadoresSmt: DashboardIndicadorLinha[];
  pedidosAgendadosPorOperadora: Record<string, number>;
};

function totalPorOperadora(snapshot: EstoqueSnapshot | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!snapshot) return out;
  for (const op of snapshot.operadoras) out[op.operadora] = op.totalGeral;
  return out;
}

function indicadores(snapshot: EstoqueSnapshot | null): DashboardIndicadorLinha[] {
  if (!snapshot) return [];
  return snapshot.operadoras.map((op) => ({
    operadora: op.operadora,
    ativos: op.ativos.total,
    preAtivos: op.preAtivos.total,
    suspensos: op.suspensos.total,
    total: op.totalGeral,
  }));
}

export function buildDashboard(state: AppState): DashboardViewModel {
  const smartTotais = totalPorOperadora(state.estoqueSmart);
  const smtTotais = totalPorOperadora(state.estoqueSmt);

  const operadoras = Array.from(new Set([...Object.keys(smartTotais), ...Object.keys(smtTotais)])).sort();

  const consolidado: DashboardConsolidadoLinha[] = operadoras.map((operadora) => {
    const smart = smartTotais[operadora] ?? 0;
    const smt = smtTotais[operadora] ?? 0;
    return { operadora, smart, smt, totalGeral: smart + smt };
  });

  const totalConsolidado = consolidado.reduce(
    (acc, linha) => ({
      smart: acc.smart + linha.smart,
      smt: acc.smt + linha.smt,
      totalGeral: acc.totalGeral + linha.totalGeral,
    }),
    { smart: 0, smt: 0, totalGeral: 0 }
  );

  const atualizadoEm = [state.estoqueSmart?.geradoEm, state.estoqueSmt?.geradoEm, state.pedidos?.geradoEm]
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  return {
    atualizadoEm,
    consolidado,
    totalConsolidado,
    indicadoresSmart: indicadores(state.estoqueSmart),
    indicadoresSmt: indicadores(state.estoqueSmt),
    pedidosAgendadosPorOperadora: state.pedidos?.pendentesPorOperadora ?? {},
  };
}

export type EstoqueGeralLinha = {
  operadora: string;
  smart: number;
  pendentes: number;
  totalSmart: number; // smart - pendentes
  smt: number;
  estoqueTotal: number; // totalSmart + smt
  novaCompra: number; // manual
  saldoResidual: number; // estoqueTotal + novaCompra
};

export type EstoqueGeralViewModel = {
  atualizadoEm: string | null;
  linhas: EstoqueGeralLinha[];
  totalGeral: EstoqueGeralLinha;
  pedidosAgendados: PedidoAgendado[];
};

export function buildEstoqueGeral(state: AppState): EstoqueGeralViewModel {
  const smartTotais = totalPorOperadora(state.estoqueSmart);
  const smtTotais = totalPorOperadora(state.estoqueSmt);
  const pendentes = state.pedidos?.pendentesPorOperadora ?? {};

  const operadoras = Array.from(
    new Set([...Object.keys(smartTotais), ...Object.keys(smtTotais), ...Object.keys(pendentes)])
  ).sort();

  const linhas: EstoqueGeralLinha[] = operadoras.map((operadora) => {
    const smart = smartTotais[operadora] ?? 0;
    const pend = pendentes[operadora] ?? 0;
    const totalSmart = smart - pend;
    const smt = smtTotais[operadora] ?? 0;
    const estoqueTotal = totalSmart + smt;
    const novaCompra = state.novasCompras[operadora] ?? 0;
    const saldoResidual = estoqueTotal + novaCompra;
    return { operadora, smart, pendentes: pend, totalSmart, smt, estoqueTotal, novaCompra, saldoResidual };
  });

  const totalGeral = linhas.reduce(
    (acc, l) => ({
      operadora: "TOTAL GERAL",
      smart: acc.smart + l.smart,
      pendentes: acc.pendentes + l.pendentes,
      totalSmart: acc.totalSmart + l.totalSmart,
      smt: acc.smt + l.smt,
      estoqueTotal: acc.estoqueTotal + l.estoqueTotal,
      novaCompra: acc.novaCompra + l.novaCompra,
      saldoResidual: acc.saldoResidual + l.saldoResidual,
    }),
    {
      operadora: "TOTAL GERAL",
      smart: 0,
      pendentes: 0,
      totalSmart: 0,
      smt: 0,
      estoqueTotal: 0,
      novaCompra: 0,
      saldoResidual: 0,
    } as EstoqueGeralLinha
  );

  const atualizadoEm = [state.estoqueSmart?.geradoEm, state.estoqueSmt?.geradoEm, state.pedidos?.geradoEm]
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  return {
    atualizadoEm,
    linhas,
    totalGeral,
    pedidosAgendados: state.pedidos?.pedidosAgendados ?? [],
  };
}
