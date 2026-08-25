"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import UploadForm from "./UploadForm";

type UploadStatus = {
  estoqueSmart: { geradoEm: string; totalLinhas: number } | null;
  estoqueSmt: { geradoEm: string; totalLinhas: number } | null;
  pedidos: { geradoEm: string; totalPedidos: number } | null;
};

function formatarData(iso: string | null | undefined): string {
  if (!iso) return "nunca importado";
  return new Date(iso).toLocaleString("pt-BR");
}

export default function UploadPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<UploadStatus | null>(null);

  function carregar() {
    setLoading(true);
    apiGet<UploadStatus>("/data/upload-status")
      .then(setStatus)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <>
      <PageHeader title="Upload de planilhas" description="Envie os arquivos .xlsx exportados do sistema" />

      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        {loading || !status ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatusCard
              titulo="Estoque SMART"
              atualizadoEm={status.estoqueSmart?.geradoEm}
              linhas={status.estoqueSmart?.totalLinhas}
            />
            <StatusCard
              titulo="Estoque SMT"
              atualizadoEm={status.estoqueSmt?.geradoEm}
              linhas={status.estoqueSmt?.totalLinhas}
            />
            <StatusCard
              titulo="Pedidos"
              atualizadoEm={status.pedidos?.geradoEm}
              linhas={status.pedidos?.totalPedidos}
              sufixoLinhas="pendentes"
            />
          </div>
        )}

        <UploadForm onEnviado={carregar} />
      </div>
    </>
  );
}

function StatusCard({
  titulo,
  atualizadoEm,
  linhas,
  sufixoLinhas = "linhas",
}: {
  titulo: string;
  atualizadoEm?: string | null;
  linhas?: number;
  sufixoLinhas?: string;
}) {
  const importado = Boolean(atualizadoEm);
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        {importado ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <CircleDashed className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{titulo}</div>
          <div className="mt-0.5 text-sm">{formatarData(atualizadoEm)}</div>
          {linhas !== undefined && (
            <div className="text-xs text-muted-foreground">
              {linhas.toLocaleString("pt-BR")} {sufixoLinhas}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
