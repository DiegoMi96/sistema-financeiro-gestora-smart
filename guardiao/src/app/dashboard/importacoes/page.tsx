"use client"

import { useState, useEffect } from "react"
import apiClient from "@/lib/api"
import { Upload, Loader } from "lucide-react"

interface Snapshot {
  id: string
  import_date: string
  file_name: string
  total_lines: number
  total_alerts: number
  processing_status: string
  imported_at: string
}

export default function ImportacoesPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => { fetchSnapshots() }, [])

  const fetchSnapshots = async () => {
    setIsLoading(true)
    try {
      const response = await apiClient.get("/snapshots?skip=0&limit=50")
      setSnapshots(response.data?.snapshots ?? response.data ?? [])
    } catch (err: any) {
      setError("Erro ao carregar importações")
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (raw: string) =>
    new Date(raw).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Importações</h1>
        <p className="text-muted-foreground">Histórico de arquivos importados</p>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      ) : snapshots.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <Upload className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
          <p className="font-semibold text-lg">Nenhuma importação encontrada</p>
          <p className="text-muted-foreground text-sm mt-1">Faça o upload de uma planilha para começar.</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-muted border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Arquivo</th>
                  <th className="px-6 py-3 text-left font-medium">Data</th>
                  <th className="px-6 py-3 text-right font-medium">Linhas</th>
                  <th className="px-6 py-3 text-right font-medium">Alertas</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-3 font-medium">{s.file_name}</td>
                    <td className="px-6 py-3 text-muted-foreground">{formatDate(s.imported_at)}</td>
                    <td className="px-6 py-3 text-right">{s.total_lines.toLocaleString("pt-BR")}</td>
                    <td className="px-6 py-3 text-right font-medium">{s.total_alerts}</td>
                    <td className="px-6 py-3">
                      {s.processing_status === "success" ? (
                        <span className="px-2 py-1 rounded-full bg-green-500/10 text-green-600 text-xs font-semibold">✓ Sucesso</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-600 text-xs font-semibold">⏳ Processando</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
