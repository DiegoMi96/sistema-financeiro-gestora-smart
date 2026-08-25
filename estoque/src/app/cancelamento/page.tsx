"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import type { CancelamentoSnapshot } from "@/lib/types";
import type { CancelamentoResumoViewModel, CancelamentoGeralViewModel } from "@/lib/aggregateCancelamento";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshButton } from "@/components/refresh-button";
import { LoadingState } from "@/components/loading-state";
import CancelamentoDetalhe from "@/components/CancelamentoDetalhe";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtMes(anoMes: string): string {
  const [y, m] = anoMes.split("-");
  return `${MESES[Number(m) - 1]}/${y}`;
}

type ApiResponse = {
  ok: boolean;
  erro?: string;
  snapshot?: CancelamentoSnapshot;
  vm?: CancelamentoResumoViewModel;
  geral?: CancelamentoGeralViewModel;
};

export default function CancelamentoPage() {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<ApiResponse | null>(null);

  function carregar() {
    setLoading(true);
    apiGet<ApiResponse>("/data/cancelamento")
      .then(setDados)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  if (loading) {
    return (
      <>
        <PageHeader title="Controle de Cancelamento" description="Backlog de solicitações de cancelamento" />
        <LoadingState label="Carregando cancelamentos..." />
      </>
    );
  }

  if (!dados?.ok || !dados.vm || !dados.geral) {
    return (
      <>
        <PageHeader title="Controle de Cancelamento" description="Backlog de solicitações de cancelamento" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <TriangleAlert className="size-6 text-destructive" />
          </div>
          <div>
            <p className="font-medium">Não foi possível carregar a planilha</p>
            <p className="max-w-md text-sm text-muted-foreground">{dados?.erro}</p>
          </div>
          <RefreshButton onClick={carregar} />
        </div>
      </>
    );
  }

  const { vm, geral, snapshot } = dados;

  return (
    <>
      <PageHeader
        title="Controle de Cancelamento"
        description="Backlog de solicitações de cancelamento — direto do Google Sheets"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-normal">
              Atualizado em {new Date(vm.atualizadoEm!).toLocaleString("pt-BR")}
            </Badge>
            <RefreshButton onClick={carregar} />
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard titulo="Total no backlog" valor={vm.totalLinhas} />
          {vm.porStatus.map((s) => (
            <StatCard key={s.status} titulo={s.status} valor={s.total} />
          ))}
          <StatCard titulo="Vencendo em 7 dias" valor={vm.vencendoEm7Dias} destaque="amber" />
          <StatCard titulo="Vencidos" valor={vm.vencidos} destaque="red" />
          <StatCard titulo="Concluídos" valor={vm.totalConcluidos} destaque="green" />
        </div>

        {geral.meses.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Visão geral — mês x operadora</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background">Mês</TableHead>
                      {geral.operadoras.map((op) => (
                        <TableHead key={op} className="text-right">
                          {op}
                        </TableHead>
                      ))}
                      <TableHead className="text-right font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {geral.meses.map((mes) => (
                      <TableRow key={mes}>
                        <TableCell className="sticky left-0 bg-background font-medium">{fmtMes(mes)}</TableCell>
                        {geral.operadoras.map((op) => (
                          <TableCell key={op} className="text-right tabular-nums text-muted-foreground">
                            {fmt(geral.porMesOperadora[mes]?.[op] ?? 0)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-semibold tabular-nums">
                          {fmt(geral.totalPorMes[mes])}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="sticky left-0 bg-muted/50">TOTAL</TableCell>
                      {geral.operadoras.map((op) => (
                        <TableCell key={op} className="text-right tabular-nums">
                          {fmt(geral.totalPorOperadora[op])}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">{fmt(geral.totalGeral)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <CancelamentoDetalhe snapshot={snapshot ?? null} />
      </div>
    </>
  );
}

function StatCard({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: number;
  destaque?: "amber" | "red" | "green";
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{titulo}</p>
        <p
          className={
            "mt-1 text-2xl font-bold tabular-nums " +
            (destaque === "red"
              ? "text-destructive"
              : destaque === "amber"
                ? "text-amber-600 dark:text-amber-400"
                : destaque === "green"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "")
          }
        >
          {fmt(valor)}
        </p>
      </CardContent>
    </Card>
  );
}
