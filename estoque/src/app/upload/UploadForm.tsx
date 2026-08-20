"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, UploadCloud, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiPostForm } from "@/lib/apiClient";

type CampoNome = "smart" | "smt" | "pedidos";

type Campo = {
  name: CampoNome;
  label: string;
  descricao: string;
};

const CAMPOS: Campo[] = [
  {
    name: "smart",
    label: "Estoque SMART",
    descricao: "Export com uma linha por chip (planilha 'Inventário').",
  },
  {
    name: "smt",
    label: "Estoque SMT",
    descricao: "Mesmo formato do Estoque SMART.",
  },
  {
    name: "pedidos",
    label: "Pedidos",
    descricao: "Planilha de pedidos (aba 'Pedidos').",
  },
];

function FileDropzone({
  campo,
  file,
  onChange,
}: {
  campo: Campo;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold">{campo.label}</p>
        <p className="text-xs text-muted-foreground">{campo.descricao}</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />

      {file ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2.5">
          <FileSpreadsheet className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            onClick={() => onChange(null)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) onChange(dropped);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-3 py-6 text-center transition-colors",
            dragOver ? "border-primary bg-accent" : "border-border hover:bg-muted/40"
          )}
        >
          <UploadCloud className="size-5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Clique ou arraste o arquivo .xlsx aqui</span>
        </button>
      )}
    </div>
  );
}

export default function UploadForm({ onEnviado }: { onEnviado: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [arquivos, setArquivos] = useState<Record<CampoNome, File | null>>({
    smart: null,
    smt: null,
    pedidos: null,
  });

  async function handleSubmit() {
    const temArquivo = Object.values(arquivos).some(Boolean);
    if (!temArquivo) {
      toast.error("Selecione ao menos um arquivo antes de enviar.");
      return;
    }

    setEnviando(true);
    const formData = new FormData();
    for (const [name, file] of Object.entries(arquivos)) {
      if (file) formData.set(name, file);
    }

    try {
      const data = await apiPostForm<{ ok: boolean; erro?: string }>("/upload", formData);
      if (!data.ok) {
        throw new Error(data.erro ?? "Falha ao processar o arquivo.");
      }
      toast.success("Arquivo(s) processado(s) com sucesso.", {
        description: "O estoque foi atualizado com os dados mais recentes.",
      });
      setArquivos({ smart: null, smt: null, pedidos: null });
      onEnviado();
    } catch (err) {
      toast.error("Erro ao processar upload", {
        description: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enviar planilhas</CardTitle>
        <CardDescription>
          Cada upload substitui os dados anteriores daquela fonte — o sistema sempre mostra a foto mais recente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {CAMPOS.map((campo) => (
          <FileDropzone
            key={campo.name}
            campo={campo}
            file={arquivos[campo.name]}
            onChange={(file) => setArquivos((prev) => ({ ...prev, [campo.name]: file }))}
          />
        ))}

        <Button onClick={handleSubmit} disabled={enviando} className="w-full sm:w-auto">
          {enviando && <Loader2 className="animate-spin" />}
          {enviando ? "Processando..." : "Enviar e atualizar estoque"}
        </Button>
      </CardContent>
    </Card>
  );
}
