import * as XLSX from "xlsx";
import { parseFlexibleDate, toISODate } from "./dates";
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

// Mesmo parser RFC4180 usado em lib/csv.ts e em parseEstoque.ts (linhasCsv):
// nunca materializa a planilha inteira em memória, só entrega, uma linha
// por vez, um objeto com as colunas de COLUNAS_NECESSARIAS.
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

export function parsePedidosCsv(text: string): PedidosSnapshot {
  return processarLinhas(linhasCsv(text));
}
