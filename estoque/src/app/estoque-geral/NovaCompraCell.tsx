"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiPostJson } from "@/lib/apiClient";

export function NovaCompraCell({
  operadora,
  valorInicial,
  onSalvar,
}: {
  operadora: string;
  valorInicial: number;
  onSalvar: () => void;
}) {
  const [valor, setValor] = useState(valorInicial);
  const [pending, startTransition] = useTransition();

  function salvar() {
    startTransition(async () => {
      try {
        const data = await apiPostJson<{ ok: boolean; erro?: string }>("/nova-compra", { operadora, valor });
        if (!data.ok) throw new Error(data.erro ?? "Falha ao salvar.");
        toast.success(`Nova compra atualizada`, {
          description: `${operadora}: ${valor.toLocaleString("pt-BR")} unidades`,
        });
        onSalvar();
      } catch (err) {
        toast.error("Erro ao salvar nova compra", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <div className="flex justify-end gap-1.5">
      <Input
        type="number"
        min={0}
        value={valor}
        onChange={(e) => setValor(Number(e.target.value) || 0)}
        className="h-8 w-24 text-right tabular-nums"
      />
      <Button size="sm" variant="secondary" onClick={salvar} disabled={pending}>
        {pending ? "Salvando…" : "Salvar"}
      </Button>
    </div>
  );
}
