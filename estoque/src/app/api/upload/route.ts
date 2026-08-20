import { NextResponse } from "next/server";
import { parseEstoque } from "@/lib/parseEstoque";
import { parsePedidos } from "@/lib/parsePedidos";
import { setState } from "@/lib/store";
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth";

export const dynamic = "force-dynamic";

async function fileToBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
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
      const buffer = await fileToBuffer(smartFile);
      updates.estoqueSmart = parseEstoque(buffer, "SMART");
    }

    if (smtFile instanceof File && smtFile.size > 0) {
      const buffer = await fileToBuffer(smtFile);
      updates.estoqueSmt = parseEstoque(buffer, "SMT");
    }

    if (pedidosFile instanceof File && pedidosFile.size > 0) {
      const buffer = await fileToBuffer(pedidosFile);
      updates.pedidos = parsePedidos(buffer);
    }

    await setState(updates);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao processar upload:", error);
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, erro: mensagem }, { status: 500 });
  }
}
