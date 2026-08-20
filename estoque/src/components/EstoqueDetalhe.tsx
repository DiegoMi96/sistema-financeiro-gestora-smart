"use client";

import { useState } from "react";
import Link from "next/link";
import { Inbox, TriangleAlert, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { EstoqueSnapshot, LoteInfo, TipoEstoque, BucketEstoque } from "@/lib/types";
import { diasRestantes } from "@/lib/parseEstoque";
import { apiDownload } from "@/lib/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtData(iso: string): string {
  if (iso === "SEM_DATA") return "Sem data (origem)";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function exportUrl(params: {
  tipo: TipoEstoque;
  operadora: string;
  bucket: BucketEstoque;
  lote?: string;
  aguardando?: boolean;
}): string {
  const search = new URLSearchParams({
    tipo: params.tipo,
    operadora: params.operadora,
    bucket: params.bucket,
  });
  if (params.lote !== undefined) search.set("lote", params.lote);
  if (params.aguardando !== undefined) search.set("aguardando", String(params.aguardando));
  return `/export?${search.toString()}`;
}

// Download via fetch (não <a href>): a exportação exige o header
// Authorization com o token do sistema principal, que uma navegação comum
// não carrega.
function ExportButton({ path, title }: { path: string; title: string }) {
  const [baixando, setBaixando] = useState(false);

  return (
    <button
      type="button"
      title={title}
      disabled={baixando}
      onClick={() => {
        setBaixando(true);
        apiDownload(path, "export.xlsx")
          .catch(() => toast.error("Erro ao exportar planilha"))
          .finally(() => setBaixando(false));
      }}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      {baixando ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
    </button>
  );
}

function MiniLotesTable({
  lotes,
  tipo,
  operadora,
  bucket,
}: {
  lotes: LoteInfo[];
  tipo: TipoEstoque;
  operadora: string;
  bucket: BucketEstoque;
}) {
  if (lotes.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">Nenhum lote em aberto.</p>;
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground">
          <th className="py-1 text-left font-medium">Lote</th>
          <th className="py-1 text-right font-medium">Qtd.</th>
          <th className="py-1 text-right font-medium">Prazo</th>
          <th className="py-1 text-right font-medium">Dias rest.</th>
          <th className="w-6 py-1"></th>
        </tr>
      </thead>
      <tbody>
        {lotes.map((lote) => {
          const dias = diasRestantes(lote);
          const vencido = dias !== null && dias < 0;
          return (
            <tr key={lote.data} className="border-t">
              <td className="py-1.5 text-foreground/90">{fmtData(lote.data)}</td>
              <td className="py-1.5 text-right tabular-nums text-foreground/90">{fmt(lote.quantidade)}</td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">{lote.prazoDias || "—"}d</td>
              <td
                className={cn(
                  "py-1.5 text-right tabular-nums font-medium",
                  vencido ? "text-destructive" : "text-foreground/90"
                )}
              >
                <span className="inline-flex items-center justify-end gap-1">
                  {vencido && <TriangleAlert className="size-3" />}
                  {dias === null ? "—" : dias}
                </span>
              </td>
              <td className="py-1.5 pl-1 text-right">
                <ExportButton
                  path={exportUrl({ tipo, operadora, bucket, lote: lote.data })}
                  title={`Exportar linhas: ${operadora} · ${fmtData(lote.data)}`}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function EstoqueDetalhe({ snapshot }: { snapshot: EstoqueSnapshot | null }) {
  if (!snapshot) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Inbox className="size-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Nenhum arquivo importado ainda</p>
          <p className="text-sm text-muted-foreground">
            <Link href="/upload" className="text-primary underline underline-offset-4">
              Envie a planilha
            </Link>{" "}
            para ver este estoque.
          </p>
        </div>
      </div>
    );
  }

  const tipo = snapshot.tipo;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <p className="text-xs text-muted-foreground">
        {fmt(snapshot.totalLinhas)} linhas processadas · atualizado em{" "}
        {new Date(snapshot.geradoEm).toLocaleString("pt-BR")}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {snapshot.operadoras.map((op) => (
          <Card key={op.operadora}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{op.operadora}</CardTitle>
                <Badge variant="outline" className="font-mono tabular-nums">
                  {fmt(op.totalGeral)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <StatusBadge status="ativo">Ativos</StatusBadge>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold tabular-nums">{fmt(op.ativos.total)}</span>
                    {op.ativos.total > 0 && (
                      <ExportButton
                        path={exportUrl({ tipo, operadora: op.operadora, bucket: "ATIVO" })}
                        title={`Exportar ativos: ${op.operadora}`}
                      />
                    )}
                  </div>
                </div>
                {op.ativos.aguardandoSuspensao > 0 && (
                  <div className="mt-2 flex items-center justify-between">
                    <StatusBadge status="aguardando">
                      {fmt(op.ativos.aguardandoSuspensao)} aguardando suspensão
                    </StatusBadge>
                    <ExportButton
                      path={exportUrl({ tipo, operadora: op.operadora, bucket: "ATIVO", aguardando: true })}
                      title={`Exportar aguardando suspensão: ${op.operadora}`}
                    />
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between">
                  <StatusBadge status="pre-ativo">Pré-ativos</StatusBadge>
                  <span className="text-sm font-semibold tabular-nums">{fmt(op.preAtivos.total)}</span>
                </div>
                <MiniLotesTable lotes={op.preAtivos.lotes} tipo={tipo} operadora={op.operadora} bucket="PRE_ATIVO" />
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between">
                  <StatusBadge status="suspenso">Suspensos</StatusBadge>
                  <span className="text-sm font-semibold tabular-nums">{fmt(op.suspensos.total)}</span>
                </div>
                <MiniLotesTable lotes={op.suspensos.lotes} tipo={tipo} operadora={op.operadora} bucket="SUSPENSO" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
