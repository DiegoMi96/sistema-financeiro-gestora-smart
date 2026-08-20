import * as XLSX from "xlsx";
import { fetchCancelamentoSnapshotSafe } from "@/lib/googleSheets";
import { buildMultaContratual } from "@/lib/aggregateCancelamento";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

function fmtData(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export async function GET(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  const resultado = await fetchCancelamentoSnapshotSafe();

  if (!resultado.ok) {
    return new Response(resultado.erro, { status: 502 });
  }

  const vm = buildMultaContratual(resultado.snapshot);

  const dados = vm.itens.map((item) => ({
    MSISDN: item.msisdn,
    ICCID: item.iccid,
    Operadora: item.operadora,
    Status: item.status,
    "Data de ativação": fmtData(item.dataAtivacao),
    "Fim da fidelidade": fmtData(item.dataFimFidelidade),
    "Dias restantes": item.diasRestantes,
    Situação: item.diasRestantes >= 0 ? "Dentro da fidelidade (risco de multa)" : "Fora da fidelidade (livre)",
  }));

  const worksheet = XLSX.utils.json_to_sheet(dados);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Multa Contratual");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const dataArquivo = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Multa_Contratual_${dataArquivo}.xlsx"`,
    },
  });
}
