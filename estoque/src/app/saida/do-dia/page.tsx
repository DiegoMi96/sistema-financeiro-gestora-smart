"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import type { SaidaDoDiaViewModel } from "@/lib/aggregateSaida";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/refresh-button";
import { Skeleton } from "@/components/ui/skeleton";

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtData(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function SaidaDoDiaPage() {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 md:m-6" />}>
      <SaidaDoDiaContent />
    </Suspense>
  );
}

function SaidaDoDiaContent() {
  const searchParams = useSearchParams();
  const data = searchParams.get("data") ?? undefined;

  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [vm, setVm] = useState<SaidaDoDiaViewModel | null>(null);

  function carregar() {
    setLoading(true);
    const qs = data ? `?data=${data}` : "";
    apiGet<{ ok: boolean; erro?: string; vm?: SaidaDoDiaViewModel }>(`/data/saida-do-dia${qs}`)
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
  }, [data]);

  if (loading) {
    return (
      <>
        <PageHeader title="Saída do dia" description="Pedidos expedidos numa data específica" />
        <div className="p-4 md:p-6">
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  if (!ok || !vm) {
    return (
      <>
        <PageHeader title="Saída do dia" description="Pedidos expedidos numa data específica" />
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

  const totalQuantidade = vm.linhas.reduce((s, l) => s + l.quantidade, 0);

  return (
    <>
      <PageHeader
        title="Saída do dia"
        description="Mostra sempre a última data de saída lançada — escolha outra data se quiser ver um dia anterior"
        actions={<RefreshButton onClick={carregar} />}
      />

      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="data" className="text-xs font-medium text-muted-foreground">
              Data selecionada
            </label>
            <input
              id="data"
              name="data"
              type="date"
              defaultValue={vm.data ?? ""}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <Button type="submit">Ver data</Button>
        </form>

        <Card>
          <CardHeader>
            <CardTitle>
              {vm.data ? `Pedidos expedidos em ${fmtData(vm.data)}` : "Nenhuma data de saída encontrada"} ·{" "}
              {vm.linhas.length} linha(s) · {fmt(totalQuantidade)} unidades
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vm.linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pedido expedido nessa data.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Operadora</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Cód. Rastreio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vm.linhas.map((l, i) => (
                    <TableRow key={`${l.pedidoId}-${l.operadora}-${i}`}>
                      <TableCell className="font-medium">{l.pedidoId}</TableCell>
                      <TableCell className="max-w-64 truncate whitespace-nowrap">{l.cliente}</TableCell>
                      <TableCell>{l.operadora}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(l.quantidade)}</TableCell>
                      <TableCell>{l.codRastreio || "—"}</TableCell>
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
