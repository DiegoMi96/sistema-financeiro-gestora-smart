"use client";

import { PermissionGate } from "@/components/permission-gate";
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import type { SaidaDashboardViewModel } from "@/lib/aggregateSaida";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshButton } from "@/components/refresh-button";
import { LoadingState } from "@/components/loading-state";

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function SaidaDashboardPageContent() {
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [vm, setVm] = useState<SaidaDashboardViewModel | null>(null);

  function carregar() {
    setLoading(true);
    apiGet<{ ok: boolean; erro?: string; vm?: SaidaDashboardViewModel }>("/data/saida")
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
        <PageHeader title="Controle de Saída" description="Dashboard" />
        <LoadingState label="Carregando saída..." />
      </>
    );
  }

  if (!ok || !vm) {
    return (
      <>
        <PageHeader title="Controle de Saída" description="Dashboard" />
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

  return (
    <>
      <PageHeader
        title="Controle de Saída"
        description="Dashboard — direto do Google Sheets"
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard titulo="Expedido no mês" valor={vm.totalExpedidoMes} />
          <StatCard titulo="Expedido no ano" valor={vm.totalExpedidoAno} />
          <StatCard titulo="Expedido (geral)" valor={vm.totalExpedidoGeral} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard titulo="Pedidos pendentes" valor={vm.pedidosPendentes} />
          <StatCard titulo="Aguardando retorno/reenvio" valor={vm.aguardandoRetornoReenvio} />
          <StatCard titulo="Reenviados (total)" valor={vm.reenviadosTotal} />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Tendência mensal (últimos 12 meses)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Total expedido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vm.tendenciaMensal.map((m) => (
                    <TableRow key={`${m.ano}-${m.mes}`}>
                      <TableCell className="font-medium">
                        {MESES[m.mes - 1]}/{m.ano}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(m.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total expedido por operadora (geral)</CardTitle>
            </CardHeader>
            <CardContent>
              {vm.porOperadora.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados importados.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operadora</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vm.porOperadora.map((o) => (
                      <TableRow key={o.operadora}>
                        <TableCell className="font-medium">{o.operadora}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(o.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatCard({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{titulo}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{fmt(valor)}</p>
      </CardContent>
    </Card>
  );
}

export default function SaidaDashboardPage() {
  return (
    <PermissionGate permission="can_view_est_saida_dashboard" title="Controle de Saída">
      <SaidaDashboardPageContent />
    </PermissionGate>
  );
}
