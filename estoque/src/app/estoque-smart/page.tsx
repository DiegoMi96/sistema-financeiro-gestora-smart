"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { EstoqueSnapshot } from "@/lib/types";
import EstoqueDetalhe from "@/components/EstoqueDetalhe";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function EstoqueSmartPage() {
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
        <div className="p-4 md:p-6">
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <EstoqueDetalhe snapshot={snapshot} />
      )}
    </>
  );
}
