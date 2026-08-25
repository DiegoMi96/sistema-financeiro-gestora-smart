"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { EstoqueSnapshot } from "@/lib/types";
import EstoqueDetalhe from "@/components/EstoqueDetalhe";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";

export default function EstoqueSmtPage() {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<EstoqueSnapshot | null>(null);

  useEffect(() => {
    apiGet<{ snapshot: EstoqueSnapshot | null }>("/data/estoque-smt")
      .then((res) => setSnapshot(res.snapshot))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader title="Estoque SMT" description="Ativos, pré-ativos e suspensos por operadora" />
      {loading ? (
        <LoadingState label="Carregando estoque SMT..." />
      ) : (
        <EstoqueDetalhe snapshot={snapshot} />
      )}
    </>
  );
}
