"use client";

import { PermissionGate } from "@/components/permission-gate";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import type { DashboardViewModel } from "@/lib/aggregate";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/loading-state";

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function DashboardPageContent() {
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [vm, setVm] = useState<DashboardViewModel | null>(null);

  useEffect(() => {
    apiGet<{ empty: boolean; vm?: DashboardViewModel }>("/data/dashboard")
      .then((res) => {
        setEmpty(res.empty);
        setVm(res.vm ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <LoadingState label="Carregando dashboard..." />
      </>
    );
  }

  if (empty || !vm) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={
          vm.atualizadoEm && (
            <Badge variant="secondary" className="font-normal">
              Atualizado em {new Date(vm.atualizadoEm).toLocaleString("pt-BR")}
            </Badge>
          )
        }
      />

      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Estoque consolidado</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operadora</TableHead>
                  <TableHead className="text-right">SMART</TableHead>
                  <TableHead className="text-right">SMT</TableHead>
                  <TableHead className="text-right">Total geral</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vm.consolidado.map((l) => (
                  <TableRow key={l.operadora}>
                    <TableCell className="font-medium">{l.operadora}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(l.smart)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(l.smt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(l.totalGeral)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>TOTAL GERAL</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(vm.totalConsolidado.smart)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(vm.totalConsolidado.smt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(vm.totalConsolidado.totalGeral)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <IndicadoresCard titulo="Indicadores SMART — por operadora" linhas={vm.indicadoresSmart} />
          <IndicadoresCard titulo="Indicadores SMT — por operadora" linhas={vm.indicadoresSmt} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pedidos pendentes por operadora</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(vm.pedidosAgendadosPorOperadora).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pedido pendente.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operadora</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(vm.pedidosAgendadosPorOperadora)
                    .sort((a, b) => b[1] - a[1])
                    .map(([operadora, total]) => (
                      <TableRow key={operadora}>
                        <TableCell className="font-medium">{operadora}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(total)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function IndicadoresCard({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: { operadora: string; ativos: number; preAtivos: number; suspensos: number; total: number }[];
}) {
  const totais = linhas.reduce(
    (acc, l) => ({
      ativos: acc.ativos + l.ativos,
      preAtivos: acc.preAtivos + l.preAtivos,
      suspensos: acc.suspensos + l.suspensos,
      total: acc.total + l.total,
    }),
    { ativos: 0, preAtivos: 0, suspensos: 0, total: 0 }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados importados.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operadora</TableHead>
                <TableHead className="text-right">Ativos</TableHead>
                <TableHead className="text-right">Pré-ativos</TableHead>
                <TableHead className="text-right">Suspensos</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.operadora}>
                  <TableCell className="font-medium">{l.operadora}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(l.ativos)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(l.preAtivos)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(l.suspensos)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(l.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>TOTAL</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totais.ativos)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totais.preAtivos)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totais.suspensos)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totais.total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="size-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">Nenhum dado importado ainda</p>
        <p className="text-sm text-muted-foreground">
          <Link href="/upload" className="text-primary underline underline-offset-4">
            Envie as planilhas
          </Link>{" "}
          para ver o dashboard.
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <PermissionGate permission="can_view_est_dashboard" title="Dashboard">
      <DashboardPageContent />
    </PermissionGate>
  );
}
