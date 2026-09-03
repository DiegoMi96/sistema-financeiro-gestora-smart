"use client";

import { PermissionGate } from "@/components/permission-gate";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { EstoqueSnapshot } from "@/lib/types";
import EstoqueDetalhe from "@/components/EstoqueDetalhe";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";

function EstoqueSmartPageContent() {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<EstoqueSnapshot | null>(null);

  useEffect(() => {
    apiGet<{ snapshot: EstoqueSnapshot | null }>("/data/estoque-smart")
      .then((res) => setSnapshot(res.snapshot))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader title="Estoque SMART" description="Ativos, pré-ativos e suspensos por operadora" />
      {loading ? (
        <LoadingState label="Carregando estoque SMART..." />
      ) : (
        <EstoqueDetalhe snapshot={snapshot} />
      )}
    </>
  );
}

export default function EstoqueSmartPage() {
  return (
    <PermissionGate permission="can_view_est_smart" title="Estoque SMART">
      <EstoqueSmartPageContent />
    </PermissionGate>
  );
}
