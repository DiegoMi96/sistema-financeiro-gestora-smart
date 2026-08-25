import * as XLSX from "xlsx";
import { parseFlexibleDate, toISODate } from "./dates";
import { linhasCsvSeletivas } from "./csv";
import type { PedidoAgendado, PedidosSnapshot } from "./types";

// Rótulos de operadora usados dentro do pedido que na verdade se referem
// às operadoras "ALGAR ONE" do estoque, só com outro nome.
const MAPA_ROTULOS: Record<string, string> = {
  "SMART VIVO": "ALGAR ONE VIVO",
  "SMART MULTI": "ALGAR MULTI",
  "SMART TIM": "ALGAR ONE TIM",
};

function mapearOperadora(rotulo: string): string {
  return MAPA_ROTULOS[rotulo] ?? rotulo;
}

type RawRow = Record<string, unknown>;

// Colunas realmente usadas no laço abaixo — o parser CSV (parseEstoqueCsv
// em parseEstoque.ts tem a mesma ideia) só materializa estas, pra não
// carregar a planilha inteira em memória (ver commit da correção do SMT).
const COLUNAS_NECESSARIAS = [
  "Status",
  "ID",
  "Cliente",
  "DataInserção",
  "Contrato_Operadora_1",
  "Contrato_Quantidade_1",
  "Contrato_Operadora_2",
  "Contrato_Quantidade_2",
  "Contrato_Operadora_3",
  "Contrato_Quantidade_3",
  "Contrato_Operadora_4",
  "Contrato_Quantidade_4",
] as const;

function processarLinhas(rows: Iterable<RawRow>): PedidosSnapshot {
  const pendentesPorOperadora: Record<string, number> = {};
  const pedidosAgendados: PedidoAgendado[] = [];
  let totalPedidosPendentes = 0;

  for (const row of rows) {
    const status = String(row["Status"] ?? "").trim();
    if (status !== "Pendente") continue;

    totalPedidosPendentes += 1;
    const pedidoId = String(row["ID"] ?? "").trim();
    const cliente = String(row["Cliente"] ?? "").trim();
    const dataInsercao = parseFlexibleDate(row["DataInserção"]);
    const dataPedido = dataInsercao ? toISODate(dataInsercao) : null;

    for (let i = 1; i <= 4; i++) {
      const rotuloBruto = row[`Contrato_Operadora_${i}`];
      if (!rotuloBruto) continue;
      const rotulo = String(rotuloBruto).trim();
      if (!rotulo) continue;

      const quantidade = Number(row[`Contrato_Quantidade_${i}`]) || 0;
      if (quantidade <= 0) continue;

      const operadora = mapearOperadora(rotulo);

      pendentesPorOperadora[operadora] = (pendentesPorOperadora[operadora] ?? 0) + quantidade;
      pedidosAgendados.push({ pedidoId, cliente, operadora, quantidade, dataPedido });
    }
  }

  return {
    geradoEm: new Date().toISOString(),
    totalPedidos: totalPedidosPendentes,
    pendentesPorOperadora,
    pedidosAgendados,
  };
}

export function parsePedidos(fileBuffer: ArrayBuffer): PedidosSnapshot {
  const workbook = XLSX.read(fileBuffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: RawRow[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return processarLinhas(rows);
}

export function parsePedidosCsv(text: string): PedidosSnapshot {
  return processarLinhas(linhasCsvSeletivas(text, COLUNAS_NECESSARIAS));
}
