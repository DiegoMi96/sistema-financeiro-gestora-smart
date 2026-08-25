"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import type { EstoqueGeralViewModel } from "@/lib/aggregate";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState } from "@/components/loading-state";
import { NovaCompraCell } from "./NovaCompraCell";

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function EstoqueGeralPage() {
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [vm, setVm] = useState<EstoqueGeralViewModel | null>(null);

  function carregar() {
    setLoading(true);
    apiGet<{ empty: boolean; vm?: EstoqueGeralViewModel }>("/data/estoque-geral")
      .then((res) => {
        setEmpty(res.empty);
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
        <PageHeader title="Estoque Geral" />
        <LoadingState label="Carregando estoque geral..." />
      </>
    );
  }

  if (empty || !vm) {
    return (
      <>
        <PageHeader title="Estoque Geral" />
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
              para ver o estoque geral.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Estoque Geral"
        description="Visão consolidada por operadora"
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
            <CardTitle>Resumo de estoque por operadora</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operadora</TableHead>
                  <TableHead className="text-right">SMART</TableHead>
                  <TableHead className="text-right">Pendentes</TableHead>
                  <TableHead className="text-right">Total SMART</TableHead>
                  <TableHead className="text-right">SMT</TableHead>
                  <TableHead className="text-right">Estoque total</TableHead>
                  <TableHead className="text-right">Nova compra</TableHead>
                  <TableHead className="text-right">Saldo residual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vm.linhas.map((l) => (
                  <TableRow key={l.operadora}>
                    <TableCell className="font-medium">{l.operadora}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(l.smart)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(l.pendentes)}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${l.totalSmart < 0 ? "font-semibold text-destructive" : ""}`}
                    >
                      {fmt(l.totalSmart)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(l.smt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(l.estoqueTotal)}</TableCell>
                    <TableCell>
                      <NovaCompraCell operadora={l.operadora} valorInicial={l.novaCompra} onSalvar={carregar} />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmt(l.saldoResidual)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>TOTAL GERAL</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(vm.totalGeral.smart)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(vm.totalGeral.pendentes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(vm.totalGeral.totalSmart)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(vm.totalGeral.smt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(vm.totalGeral.estoqueTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(vm.totalGeral.novaCompra)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(vm.totalGeral.saldoResidual)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              Nova compra é o único campo editável manualmente — os demais são calculados a partir das planilhas
              importadas.
            </p>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pedidos pendentes ({vm.pedidosAgendados.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {vm.pedidosAgendados.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pedido pendente.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Operadora</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead>Data do pedido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vm.pedidosAgendados.map((p, i) => (
                      <TableRow key={`${p.pedidoId}-${p.operadora}-${i}`}>
                        <TableCell className="font-medium">{p.pedidoId}</TableCell>
                        <TableCell className="max-w-64 truncate whitespace-nowrap">{p.cliente}</TableCell>
                        <TableCell>{p.operadora}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(p.quantidade)}</TableCell>
                        <TableCell className="tabular-nums">{fmtData(p.dataPedido)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
