import Link from "next/link";
import { Inbox, TriangleAlert } from "lucide-react";
import type { CancelamentoSnapshot, CancelamentoLote } from "@/lib/types";
import { diasRestantesPrazo } from "@/lib/aggregateCancelamento";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

// `lote.prazo` guarda o último dia do mês (ex.: "2026-09-30") — exibimos só o mês/ano.
function fmtMes(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MESES[Number(m) - 1]}/${y}`;
}

function statusClasses(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "permanente") {
    return "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20";
  }
  if (s === "suspenso") {
    return "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20";
  }
  return "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20";
}

function MiniLotesTable({ lotes }: { lotes: CancelamentoLote[] }) {
  if (lotes.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">Nenhum lote em aberto.</p>;
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground">
          <th className="py-1 text-left font-medium">Mês</th>
          <th className="py-1 text-right font-medium">Qtd.</th>
          <th className="py-1 text-right font-medium">Dias até o fim do mês</th>
        </tr>
      </thead>
      <tbody>
        {lotes.map((lote) => {
          const dias = diasRestantesPrazo(lote.prazo);
          const vencido = dias < 0;
          return (
            <tr key={lote.prazo} className="border-t">
              <td className="py-1.5 text-foreground/90">{fmtMes(lote.prazo)}</td>
              <td className="py-1.5 text-right tabular-nums text-foreground/90">{fmt(lote.quantidade)}</td>
              <td
                className={cn(
                  "py-1.5 text-right tabular-nums font-medium",
                  vencido ? "text-destructive" : "text-foreground/90"
                )}
              >
                <span className="inline-flex items-center justify-end gap-1">
                  {vencido && <TriangleAlert className="size-3" />}
                  {dias}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function CancelamentoDetalhe({ snapshot }: { snapshot: CancelamentoSnapshot | null }) {
  if (!snapshot) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Inbox className="size-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Nenhum arquivo importado ainda</p>
          <p className="text-sm text-muted-foreground">
            <Link href="/cancelamento/upload" className="text-primary underline underline-offset-4">
              Envie a planilha de backlog
            </Link>{" "}
            para ver o cancelamento.
          </p>
        </div>
      </div>
    );
  }

  return (
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
            {op.porStatus.map((grupo, i) => (
              <div key={grupo.status}>
                {i > 0 && <Separator className="mb-4" />}
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
                      statusClasses(grupo.status)
                    )}
                  >
                    {grupo.status}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{fmt(grupo.total)}</span>
                </div>
                <MiniLotesTable lotes={grupo.lotes} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
