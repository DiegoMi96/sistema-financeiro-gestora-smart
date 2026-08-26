"use client";

import { PermissionGate } from "@/components/permission-gate";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import type { SaidaResumoViewModel } from "@/lib/aggregateSaida";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/refresh-button";
import { LoadingState } from "@/components/loading-state";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function fmt(n: number): string {
  return n === 0 ? "" : n.toLocaleString("pt-BR");
}

function ResumoSaidaPageContent() {
  return (
    <Suspense fallback={<LoadingState label="Carregando..." />}>
      <ResumoSaidaContent />
    </Suspense>
  );
}

function ResumoSaidaContent() {
  const searchParams = useSearchParams();
  const hoje = new Date();
  const ano = Number(searchParams.get("ano")) || hoje.getFullYear();
  const mes = Number(searchParams.get("mes")) || hoje.getMonth() + 1;

  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [vm, setVm] = useState<SaidaResumoViewModel | null>(null);

  function carregar() {
    setLoading(true);
    apiGet<{ ok: boolean; erro?: string; vm?: SaidaResumoViewModel }>(`/data/saida-resumo?ano=${ano}&mes=${mes}`)
      .then((res) => {
        setOk(res.ok);
        setErro(res.erro ?? null);
        setVm(res.vm ?? null);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, mes]);

  if (loading) {
    return (
      <>
        <PageHeader title="Resumo por operadora" description="Quantidade expedida por dia" />
        <LoadingState label="Carregando resumo..." />
      </>
    );
  }

  if (!ok || !vm) {
    return (
      <>
        <PageHeader title="Resumo por operadora" description="Quantidade expedida por dia" />
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

  const dias = Array.from({ length: vm.diasNoMes }, (_, i) => i + 1);
  const anosDisponiveis = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i);

  return (
    <>
      <PageHeader
        title="Resumo por operadora"
        description="Quantidade expedida por dia, no período selecionado"
        actions={<RefreshButton onClick={carregar} />}
      />

      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="ano" className="text-xs font-medium text-muted-foreground">
              Ano
            </label>
            <select
              id="ano"
              name="ano"
              defaultValue={ano}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {anosDisponiveis.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="mes" className="text-xs font-medium text-muted-foreground">
              Mês
            </label>
            <select
              id="mes"
              name="mes"
              defaultValue={mes}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {MESES.map((nome, i) => (
                <option key={nome} value={i + 1}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">Filtrar</Button>
        </form>

        <Card>
          <CardHeader>
            <CardTitle>
              {MESES[mes - 1]}/{ano} — total {fmt(vm.totalGeral) || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vm.operadoras.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma saída registrada nesse período.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background">Operadora</TableHead>
                      {dias.map((d) => (
                        <TableHead key={d} className="text-right">
                          {d}
                        </TableHead>
                      ))}
                      <TableHead className="text-right font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vm.operadoras.map((op) => (
                      <TableRow key={op.operadora}>
                        <TableCell className="sticky left-0 bg-background font-medium">{op.operadora}</TableCell>
                        {op.porDia.map((v, i) => (
                          <TableCell key={i} className="text-right tabular-nums text-muted-foreground">
                            {fmt(v)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-semibold tabular-nums">{fmt(op.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="sticky left-0 bg-muted/50">TOTAL</TableCell>
                      {vm.totalPorDia.map((v, i) => (
                        <TableCell key={i} className="text-right tabular-nums">
                          {fmt(v)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">{fmt(vm.totalGeral)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function ResumoSaidaPage() {
  return (
    <PermissionGate permission="can_view_est_saida_resumo" title="Resumo por operadora">
      <ResumoSaidaPageContent />
    </PermissionGate>
  );
}
