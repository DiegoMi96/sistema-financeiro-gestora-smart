import { NextResponse } from "next/server";
import { parseEstoque, parseEstoqueCsv } from "@/lib/parseEstoque";
import { parsePedidos, parsePedidosCsv } from "@/lib/parsePedidos";
import { setState } from "@/lib/store";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";
import type { EstoqueSnapshot, PedidosSnapshot, TipoEstoque } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fileToBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

// Arquivos grandes (ex.: SMT com 36 mil linhas) esgotam a memória do
// container se lidos como .xlsx — XLSX.read monta a planilha inteira antes
// de qualquer filtro de coluna ser possível. Exportando como .csv, o
// parser lê só as colunas necessárias, linha a linha (ver parseEstoqueCsv).
async function parseArquivoEstoque(file: File, tipo: TipoEstoque): Promise<EstoqueSnapshot> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const texto = await file.text();
    return parseEstoqueCsv(texto, tipo);
  }
  const buffer = await fileToBuffer(file);
  return parseEstoque(buffer, tipo);
}

async function parseArquivoPedidos(file: File): Promise<PedidosSnapshot> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const texto = await file.text();
    return parsePedidosCsv(texto);
  }
  const buffer = await fileToBuffer(file);
  return parsePedidos(buffer);
}

export async function POST(request: Request) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse();

  try {
    const formData = await request.formData();

    const smartFile = formData.get("smart");
    const smtFile = formData.get("smt");
    const pedidosFile = formData.get("pedidos");

    if (!(smartFile instanceof File) && !(smtFile instanceof File) && !(pedidosFile instanceof File)) {
      return NextResponse.json({ ok: false, erro: "Nenhum arquivo enviado." }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (smartFile instanceof File && smartFile.size > 0) {
      updates.estoqueSmart = await parseArquivoEstoque(smartFile, "SMART");
    }

    if (smtFile instanceof File && smtFile.size > 0) {
      updates.estoqueSmt = await parseArquivoEstoque(smtFile, "SMT");
    }

    if (pedidosFile instanceof File && pedidosFile.size > 0) {
      updates.pedidos = await parseArquivoPedidos(pedidosFile);
    }

    await setState(updates);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao processar upload:", error);
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, erro: mensagem }, { status: 500 });
  }
}
