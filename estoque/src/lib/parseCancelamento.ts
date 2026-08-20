import { parseFlexibleDate, toISODate } from "./dates";
import type { CancelamentoSnapshot, CancelamentoLinha, OperadoraCancelamento } from "./types";

type RawRow = Record<string, unknown>;

// Núcleo do parsing — recebe linhas já no formato "objeto por linha" (chave =
// cabeçalho da coluna), venham elas de um CSV do Google Sheets ou de outra
// fonte futura. Cada valor é tratado como texto e convertido explicitamente
// (nunca confiamos em inferência de tipo automática — foi isso que causava
// o ICCID perder precisão como número e o Prazo virar serial de data).
export function buildCancelamentoSnapshot(rows: RawRow[]): CancelamentoSnapshot {
  const linhas: CancelamentoLinha[] = [];

  for (const row of rows) {
    const msisdn = String(row["msisdn"] ?? "").trim();
    if (!msisdn) continue;

    const dataSolicitacao = parseFlexibleDate(row["Data Solicitação"]);
    const prazo = parseFlexibleDate(row["Prazo"]);
    if (!dataSolicitacao || !prazo) continue;

    const dataAtivacao = parseFlexibleDate(row["Data de ativação"]);
    const dataCancelamento = parseFlexibleDate(row["Cancelamento"]);

    linhas.push({
      msisdn,
      iccid: String(row["ICCID"] ?? "").trim(),
      operadora: String(row["Operadora"] ?? "").trim(),
      status: String(row["Status"] ?? "").trim(),
      dataSolicitacao: toISODate(dataSolicitacao),
      prazo: toISODate(prazo),
      dataAtivacao: dataAtivacao ? toISODate(dataAtivacao) : null,
      fidelidade: String(row["Fidelidade"] ?? "").trim(),
      dataCancelamento: dataCancelamento ? toISODate(dataCancelamento) : null,
    });
  }

  // Uma linha com "Cancelamento" preenchido já foi concluída — não é mais
  // backlog pendente. Fica registrada em `linhas` (pra dar visibilidade de
  // quantas foram concluídas), mas sai de todo o agrupamento/soma de pendentes.
  const pendentes = linhas.filter((l) => !l.dataCancelamento);
  const operadoras = agruparPorOperadora(pendentes);

  return {
    geradoEm: new Date().toISOString(),
    totalLinhas: pendentes.length,
    totalConcluidos: linhas.length - pendentes.length,
    operadoras,
    linhas,
  };
}

// Agrupamos por mês (não por dia exato) — a lista de lotes fica muito longa
// dia a dia; o mês dá uma visão mais utilizável do backlog.
function ultimoDiaDoMes(anoMes: string): string {
  const [y, m] = anoMes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${anoMes}-${String(ultimoDia).padStart(2, "0")}`;
}

function agruparPorOperadora(linhas: CancelamentoLinha[]): OperadoraCancelamento[] {
  const porOperadora = new Map<string, Map<string, Map<string, number>>>(); // operadora -> status -> ano-mês -> qtd

  for (const l of linhas) {
    if (!porOperadora.has(l.operadora)) porOperadora.set(l.operadora, new Map());
    const porStatus = porOperadora.get(l.operadora)!;
    if (!porStatus.has(l.status)) porStatus.set(l.status, new Map());
    const porMes = porStatus.get(l.status)!;
    const anoMes = l.prazo.slice(0, 7);
    porMes.set(anoMes, (porMes.get(anoMes) ?? 0) + 1);
  }

  return Array.from(porOperadora.entries())
    .map(([operadora, porStatus]) => {
      const statusGrupos = Array.from(porStatus.entries())
        .map(([status, porMes]) => {
          const lotes = Array.from(porMes.entries())
            .map(([anoMes, quantidade]) => ({ prazo: ultimoDiaDoMes(anoMes), quantidade }))
            .sort((a, b) => a.prazo.localeCompare(b.prazo));
          return { status, total: lotes.reduce((s, l) => s + l.quantidade, 0), lotes };
        })
        .sort((a, b) => b.total - a.total);
      return {
        operadora,
        porStatus: statusGrupos,
        totalGeral: statusGrupos.reduce((s, g) => s + g.total, 0),
      };
    })
    .sort((a, b) => b.totalGeral - a.totalGeral);
}
