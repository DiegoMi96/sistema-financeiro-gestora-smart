"use client"

import { useState } from "react"
import apiClient from "@/lib/api"
import { Search, Loader, CheckCircle, Clock } from "lucide-react"

interface AlertHistory {
  id: string
  client_name: string
  operator: string
  contract_type: string
  usage_percentage: number
  quota_gb: number
  used_gb: number
  competencia: string
  status: "pending" | "completed"
  triggered_at: string
  marked_as_done_at: string | null
}

export default function TimelinePage() {
  const [lineNumber, setLineNumber]   = useState("")
  const [history, setHistory]         = useState<AlertHistory[]>([])
  const [searched, setSearched]       = useState(false)
  const [isLoading, setIsLoading]     = useState(false)
  const [error, setError]             = useState("")

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    const line = lineNumber.trim()
    if (!line) return

    setIsLoading(true)
    setError("")
    setSearched(false)

    try {
      const { data } = await apiClient.get(`/lines/${encodeURIComponent(line)}/history`)
      setHistory(data.history ?? [])
      setSearched(true)
    } catch (err: any) {
      setError("Erro ao buscar histórico da linha.")
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (raw: string) =>
    new Date(raw).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Timeline da Linha</h1>
        <p className="text-muted-foreground">Histórico de acionamentos nos últimos 90 dias</p>
      </div>

      {/* Busca */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          placeholder="Número da linha (ex: 11999998888)"
          value={lineNumber}
          onChange={(e) => setLineNumber(e.target.value)}
          className="flex-1 px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Search className="w-4 h-4" />
          {isLoading ? "Buscando..." : "Buscar"}
        </button>
      </form>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">Buscando histórico...</p>
        </div>
      )}

      {!isLoading && searched && history.length === 0 && (
        <div className="text-center py-16 bg-card rounded-lg border border-border">
          <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4" />
          <p className="font-medium text-lg">Nenhum acionamento nos últimos 90 dias</p>
          <p className="text-muted-foreground text-sm mt-1">A linha <strong>{lineNumber}</strong> não foi acionada neste período.</p>
        </div>
      )}

      {!isLoading && history.length > 0 && (
        <div className="space-y-4">
          {/* Resumo */}
          <div className="grid grid-cols-5 divide-x divide-border bg-card rounded-lg border border-border">
            <div className="px-6 py-4">
              <p className="text-xs text-muted-foreground mb-1">Linha</p>
              <p className="font-semibold">{lineNumber}</p>
            </div>
            <div className="px-6 py-4">
              <p className="text-xs text-muted-foreground mb-1">Cliente</p>
              <p className="font-semibold truncate">{history[0]?.client_name || "—"}</p>
            </div>
            <div className="px-6 py-4">
              <p className="text-xs text-muted-foreground mb-1">Acionamentos (90 dias)</p>
              <p className="font-semibold">{history.length}</p>
            </div>
            <div className="px-6 py-4">
              <p className="text-xs text-muted-foreground mb-1">Pendentes</p>
              <p className="font-semibold text-yellow-600">{history.filter(h => h.status === "pending").length}</p>
            </div>
            <div className="px-6 py-4">
              <p className="text-xs text-muted-foreground mb-1">Resolvidos</p>
              <p className="font-semibold text-green-600">{history.filter(h => h.status === "completed").length}</p>
            </div>
          </div>

          {/* Tabela */}
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-muted border-b border-border">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Data do Acionamento</th>
                    <th className="px-6 py-3 text-left font-medium">Competência</th>
                    <th className="px-6 py-3 text-left font-medium">Operadora</th>
                    <th className="px-6 py-3 text-left font-medium">Tipo</th>
                    <th className="px-6 py-3 text-right font-medium">Uso (%)</th>
                    <th className="px-6 py-3 text-left font-medium">Status</th>
                    <th className="px-6 py-3 text-left font-medium">Resolvido em</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-3 font-medium">{formatDate(h.triggered_at)}</td>
                      <td className="px-6 py-3 text-muted-foreground">{h.competencia}</td>
                      <td className="px-6 py-3">{h.operator}</td>
                      <td className="px-6 py-3">
                        {h.contract_type === "shared" ? "Compartilhado" : "Individual"}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className={`font-medium ${Number(h.usage_percentage) >= 300 ? "text-destructive" : Number(h.usage_percentage) >= 100 ? "text-yellow-600" : ""}`}>
                          {Number(h.usage_percentage).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        {h.status === "completed" ? (
                          <span className="flex items-center gap-1 text-green-600 text-xs font-semibold">
                            <CheckCircle className="w-3 h-3" /> Resolvido
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-yellow-600 text-xs font-semibold">
                            <Clock className="w-3 h-3" /> Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground text-xs">
                        {h.marked_as_done_at ? formatDate(h.marked_as_done_at) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!searched && !isLoading && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Digite o número da linha para ver o histórico de acionamentos</p>
        </div>
      )}
    </div>
  )
}
