"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SheetConfigCard } from "./SheetConfigCard";

type ConfigResposta = {
  ok: boolean;
  config: { cancelamentoSheetId: string | null; saidaSheetId: string | null };
};

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<{ cancelamentoSheetId: string | null; saidaSheetId: string | null } | null>(
    null
  );

  useEffect(() => {
    apiGet<ConfigResposta>("/config/sheets")
      .then((r) => setConfig(r.config))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Vincule as planilhas do Google Sheets usadas pelo Controle de Saída e pelo Controle de Cancelamento"
      />

      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        {loading || !config ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SheetConfigCard
              campo="cancelamento"
              titulo="Planilha do Cancelamento"
              descricao="Backlog de solicitações de cancelamento (aba com as colunas MSISDN, ICCID, Operadora, Status, etc.)."
              valorSalvo={config.cancelamentoSheetId}
              onSalvo={(novoId) => setConfig((c) => (c ? { ...c, cancelamentoSheetId: novoId } : c))}
            />
            <SheetConfigCard
              campo="saida"
              titulo="Planilha da Saída"
              descricao='Controle de Saída — abas "Movimentação" e "Retorno e Reenviados".'
              valorSalvo={config.saidaSheetId}
              onSalvo={(novoId) => setConfig((c) => (c ? { ...c, saidaSheetId: novoId } : c))}
            />
          </div>
        )}
      </div>
    </>
  );
}
