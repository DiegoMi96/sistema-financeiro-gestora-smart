"use client";

import { PermissionGate } from "@/components/permission-gate";
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import type { RetornoItem } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshButton } from "@/components/refresh-button";
import { LoadingState } from "@/components/loading-state";
import { cn } from "@/lib/utils";

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function statusClasses(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "cancelado") {
    return "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20";
  }
  if (s === "reenviado") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20";
  }
  return "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20";
}

function RetornosPageContent() {
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [retornos, setRetornos] = useState<RetornoItem[]>([]);

  function carregar() {
    setLoading(true);
    apiGet<{ ok: boolean; erro?: string; retornos?: RetornoItem[] }>("/data/saida-retornos")
      .then((res) => {
        setOk(res.ok);
        setErro(res.erro ?? null);
        setRetornos(res.retornos ?? []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  if (loading) {
    return (
      <>
        <PageHeader title="Retornos e Reenvios" description="Histórico de devoluções e reenvios" />
        <LoadingState label="Carregando retornos..." />
      </>
    );
  }

  if (!ok) {
    return (
      <>
        <PageHeader title="Retornos e Reenvios" description="Histórico de devoluções e reenvios" />
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
        title="Retornos e Reenvios"
        description={`${retornos.length} registro(s)`}
        actions={<RefreshButton onClick={carregar} />}
      />

      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Histórico</CardTitle>
          </CardHeader>
          <CardContent>
            {retornos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum retorno ou reenvio registrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Operadora(s)</TableHead>
                      <TableHead className="text-right">Qtd.</TableHead>
                      <TableHead>Saída original</TableHead>
                      <TableHead>Retorno</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Reenvio</TableHead>
                      <TableHead>Novo rastreio</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {retornos.map((r, i) => (
                      <TableRow key={`${r.pedidoId}-${i}`}>
                        <TableCell className="font-medium">{r.pedidoId}</TableCell>
                        <TableCell className="max-w-48 truncate whitespace-nowrap">{r.cliente}</TableCell>
                        <TableCell>{r.operadoras}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.quantidade)}</TableCell>
                        <TableCell>{fmtData(r.dataSaidaOriginal)}</TableCell>
                        <TableCell>{fmtData(r.dataRetorno)}</TableCell>
                        <TableCell className="max-w-56 truncate whitespace-nowrap" title={r.motivoRetorno}>
                          {r.motivoRetorno || "—"}
                        </TableCell>
                        <TableCell>{fmtData(r.dataReenvio)}</TableCell>
                        <TableCell>{r.novoCodRastreio || "—"}</TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
                              statusClasses(r.status)
                            )}
                          >
                            {r.status}
                          </span>
                        </TableCell>
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

export default function RetornosPage() {
  return (
    <PermissionGate permission="can_view_est_saida_retornos" title="Retornos e Reenvios">
      <RetornosPageContent />
    </PermissionGate>
  );
}
