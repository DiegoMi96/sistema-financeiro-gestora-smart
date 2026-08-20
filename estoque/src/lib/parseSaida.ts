import { parseDataAmericana, toISODate } from "./dates";
import type { SaidaSnapshot, MovimentacaoLinha, RetornoItem } from "./types";

// Fonte: planilha "CONTROLE DE SAÍDA" no Google Sheets, abas "Movimentação"
// (dados de despacho, um pedido por linha, até 4 operadoras) e "Retorno e
// Reenviados" (histórico de devoluções/reenvios, pode ter várias linhas por
// pedido). As demais abas do arquivo original (Dashboard, Resumo, Saída de
// Pedidos, Base) são só cálculos derivados — reproduzidos em
// lib/aggregateSaida.ts, não precisam ser lidos.
//
// As datas exportadas por essa planilha vêm em formato americano (M/D/AAAA)
// — confirmado cruzando com as colunas auxiliares DIA/MÊS/ANO da origem.

type RawRow = Record<string, unknown>;

function dataISO(value: unknown): string | null {
  const d = parseDataAmericana(value);
  return d ? toISODate(d) : null;
}

export function buildSaidaSnapshot(movRows: RawRow[], retRows: RawRow[]): SaidaSnapshot {
  const movimentacao: MovimentacaoLinha[] = [];
  let totalLinhas = 0;

  for (const row of movRows) {
    const pedidoId = String(row["ID"] ?? "").trim();
    if (!pedidoId) continue;
    totalLinhas += 1;

    const base = {
      pedidoId,
      cliente: String(row["CLIENTE"] ?? "").trim(),
      status: String(row["STATUS"] ?? "").trim(),
      observacoes: String(row["OBSERVAÇÕES"] ?? "").trim(),
      codRastreio: String(row["COD. RASTREIO"] ?? "").trim(),
      dataSaida: dataISO(row["DATA DE SAÍDA"]),
    };

    for (let i = 1; i <= 4; i++) {
      const operadora = String(row[`OPERADORA ${i}`] ?? "").trim();
      if (!operadora) continue;
      const quantidade = Number(row[`QUANTIDADE ${i}`]) || 0;
      if (quantidade <= 0) continue;
      movimentacao.push({ ...base, operadora, quantidade });
    }
  }

  const retornos: RetornoItem[] = [];
  for (const row of retRows) {
    const pedidoId = String(row["PEDIDO"] ?? "").trim();
    if (!pedidoId) continue;
    retornos.push({
      pedidoId,
      cliente: String(row["CLIENTE"] ?? "").trim(),
      operadoras: String(row["OPERADORA(S)"] ?? "").trim(),
      quantidade: Number(row["QTD. TOTAL"]) || 0,
      dataSaidaOriginal: dataISO(row["DATA SAÍDA ORIGINAL"]),
      codRastreioOriginal: String(row["COD. RASTREIO ORIGINAL"] ?? "").trim(),
      dataRetorno: dataISO(row["DATA DE RETORNO"]),
      motivoRetorno: String(row["MOTIVO DO RETORNO"] ?? "").trim(),
      dataReenvio: dataISO(row["DATA DE REENVIO"]),
      novoCodRastreio: String(row["NOVO COD. RASTREIO"] ?? "").trim(),
      status: String(row["STATUS"] ?? "").trim(),
      observacoes: String(row["OBSERVAÇÕES"] ?? "").trim(),
    });
  }

  return {
    geradoEm: new Date().toISOString(),
    totalLinhas,
    movimentacao,
    retornos,
  };
}
