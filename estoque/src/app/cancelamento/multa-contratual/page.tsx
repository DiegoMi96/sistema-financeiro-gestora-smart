"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { TriangleAlert, Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiDownload } from "@/lib/apiClient";
import type { MultaContratualViewModel } from "@/lib/aggregateCancelamento";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { RefreshButton } from "@/components/refresh-button";
import { LoadingState } from "@/components/loading-state";
import { cn } from "@/lib/utils";

export const ITENS_POR_PAGINA = 25;

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtData(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function MultaContratualPage() {
  return (
    <Suspense fallback={<LoadingState label="Carregando..." />}>
      <MultaContratualContent />
    </Suspense>
  );
}

function MultaContratualContent() {
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [vm, setVm] = useState<MultaContratualViewModel | null>(null);
  const [exportando, setExportando] = useState(false);

  function carregar() {
    setLoading(true);
    apiGet<{ ok: boolean; erro?: string; vm?: MultaContratualViewModel }>("/data/cancelamento-multa")
      .then((res) => {
        setOk(res.ok);
        setErro(res.erro ?? null);
        setVm(res.vm ?? null);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  if (loading) {
    return (
      <>
        <PageHeader title="Multa Contratual" description="Linhas com fidelidade no valor do contrato" />
        <LoadingState label="Carregando multa contratual..." />
      </>
    );
  }

  if (!ok || !vm) {
    return (
      <>
        <PageHeader title="Multa Contratual" description="Linhas com fidelidade no valor do contrato" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <TriangleAlert className="size-6 text-destructive" />
          </div>
          <div>
            <p className="font-medium">Não foi possível carregar a planilha</p>
            <p className="max-w-md text-sm text-muted-foreground">{erro}</p>
          </div>
          <RefreshButton onClick={carregar} />
        </div>
      </>
    );
  }

  const totalPaginas = Math.max(1, Math.ceil(vm.itens.length / ITENS_POR_PAGINA));
  const paginaAtual = Math.min(Math.max(1, Number(searchParams.get("pagina")) || 1), totalPaginas);
  const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
  const itensDaPagina = vm.itens.slice(inicio, inicio + ITENS_POR_PAGINA);

  return (
    <>
      <PageHeader
        title="Multa Contratual"
        description='Linhas com Fidelidade = "MULTA NO VALOR DO CONTRATO" — 12 meses da ativação (24 para CLARO), alto impacto financeiro'
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-normal">
              Atualizado em {new Date(vm.atualizadoEm!).toLocaleString("pt-BR")}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={exportando}
              onClick={() => {
                setExportando(true);
                apiDownload("/export-multa-contratual", "Multa_Contratual.xlsx")
                  .catch(() => toast.error("Erro ao exportar planilha"))
                  .finally(() => setExportando(false));
              }}
            >
              {exportando ? <Loader2 className="animate-spin" /> : <Download />}
              Exportar Excel
            </Button>
            <RefreshButton onClick={carregar} />
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Total</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{fmt(vm.total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Dentro da fidelidade (risco de multa)
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-destructive">{fmt(vm.dentroDaFidelidade)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Fora da fidelidade (livre de multa)
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {fmt(vm.foraDaFidelidade)}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Linhas ordenadas por urgência (menor prazo primeiro)</CardTitle>
          </CardHeader>
          <CardContent>
            {vm.itens.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma linha com multa no valor do contrato.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>MSISDN</TableHead>
                        <TableHead>ICCID</TableHead>
                        <TableHead>Operadora</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ativação</TableHead>
                        <TableHead>Fim da fidelidade</TableHead>
                        <TableHead className="text-right">Dias restantes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensDaPagina.map((item) => {
                        const dentro = item.diasRestantes >= 0;
                        return (
                          <TableRow key={item.msisdn}>
                            <TableCell className="font-medium">{item.msisdn}</TableCell>
                            <TableCell className="font-mono text-xs">{item.iccid}</TableCell>
                            <TableCell>{item.operadora}</TableCell>
                            <TableCell>{item.status}</TableCell>
                            <TableCell>{fmtData(item.dataAtivacao)}</TableCell>
                            <TableCell>{fmtData(item.dataFimFidelidade)}</TableCell>
                            <TableCell
                              className={cn(
                                "text-right font-semibold tabular-nums",
                                dentro ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                              )}
                            >
                              {item.diasRestantes}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                  <p>
                    Mostrando {inicio + 1}–{Math.min(inicio + ITENS_POR_PAGINA, vm.itens.length)} de {fmt(vm.itens.length)}
                  </p>
                  <div className="flex items-center gap-2">
                    <PaginaLink pagina={paginaAtual - 1} disabled={paginaAtual <= 1}>
                      <ChevronLeft className="size-4" />
                      Anterior
                    </PaginaLink>
                    <span className="px-1">
                      Página {paginaAtual} de {totalPaginas}
                    </span>
                    <PaginaLink pagina={paginaAtual + 1} disabled={paginaAtual >= totalPaginas}>
                      Próxima
                      <ChevronRight className="size-4" />
                    </PaginaLink>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function PaginaLink({
  pagina,
  disabled,
  children,
}: {
  pagina: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={`/cancelamento/multa-contratual?pagina=${pagina}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {children}
    </Link>
  );
}
