"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPostJson } from "@/lib/apiClient";

type TestarResposta = { ok: boolean; erro?: string };
type SalvarResposta = { ok: boolean; erro?: string };

export function SheetConfigCard({
  campo,
  titulo,
  descricao,
  valorSalvo,
  onSalvo,
}: {
  campo: "cancelamento" | "saida";
  titulo: string;
  descricao: string;
  valorSalvo: string | null;
  onSalvo: (novoId: string) => void;
}) {
  const [valor, setValor] = useState(valorSalvo ?? "");
  const [testando, setTestando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<"ok" | "erro" | null>(null);

  async function testarConexao() {
    if (!valor.trim()) {
      toast.error("Cole o link ou o ID da planilha antes de testar.");
      return;
    }
    setTestando(true);
    setResultadoTeste(null);
    try {
      const res = await apiPostJson<TestarResposta>("/config/sheets/testar", { campo, valor });
      if (res.ok) {
        setResultadoTeste("ok");
        toast.success("Planilha respondeu normalmente.");
      } else {
        setResultadoTeste("erro");
        toast.error(res.erro ?? "Não foi possível acessar a planilha.");
      }
    } catch {
      setResultadoTeste("erro");
      toast.error("Erro ao testar a conexão.");
    } finally {
      setTestando(false);
    }
  }

  async function salvarVinculo() {
    if (!valor.trim()) {
      toast.error("Cole o link ou o ID da planilha antes de salvar.");
      return;
    }
    setSalvando(true);
    try {
      const res = await apiPostJson<SalvarResposta & { config?: Record<string, string | null> }>(
        "/config/sheets",
        { campo, valor }
      );
      if (res.ok) {
        toast.success("Vínculo salvo.");
        const chave = campo === "cancelamento" ? "cancelamentoSheetId" : "saidaSheetId";
        const novoId = res.config?.[chave];
        if (novoId) {
          setValor(novoId);
          onSalvo(novoId);
        }
      } else {
        toast.error(res.erro ?? "Não foi possível salvar.");
      }
    } catch {
      toast.error("Erro ao salvar o vínculo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Link ou ID da planilha</label>
          <Input
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setResultadoTeste(null);
            }}
            placeholder="https://docs.google.com/spreadsheets/d/..."
          />
          <p className="text-xs text-muted-foreground">
            A planilha precisa estar compartilhada como &quot;Qualquer pessoa com o link pode visualizar&quot;.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={testarConexao} disabled={testando}>
            {testando && <Loader2 className="size-3.5 animate-spin" />}
            Testar conexão
          </Button>
          <Button type="button" size="sm" onClick={salvarVinculo} disabled={salvando}>
            {salvando && <Loader2 className="size-3.5 animate-spin" />}
            Salvar vínculo
          </Button>

          {resultadoTeste === "ok" && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" /> Conectado
            </span>
          )}
          {resultadoTeste === "erro" && (
            <span className="flex items-center gap-1 text-xs font-medium text-destructive">
              <XCircle className="size-3.5" /> Falhou
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
