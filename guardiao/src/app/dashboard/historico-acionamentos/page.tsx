"use client"

import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api"
import { History, CheckCircle2 } from "lucide-react"

interface AlertHistory {
  id: string
  original_id: string
  line_number: string
  client_name: string
  cpf_cnpj: string
  operator: string
  contract_type: string
  quota_mb: number
  used_gb: number
  usage_percentage: number
  competencia: string
  triggered_at: string
  marked_as_done_at: string
  archived_at: string
}

export default function HistoricoAcionamentosPage() {
  const [rows, setRows]               = useState<AlertHistory[]>([])
  const [months, setMonths]           = useState<string[]>([])
  const [competencia, setCompetencia] = useState("")
  const [loading, setLoading]         = useState(true)

  async function fetchHistory(comp?: string) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (comp) params.set("competencia", comp)
      const res = await apiClient.get(`/alert-history?${params.toString()}`)
      setRows(res.data.rows ?? [])
      setMonths(res.data.months ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchHistory() }, [])

  function handleMonthChange(value: string) {
    setCompetencia(value)
    fetchHistory(value || undefined)
  }

  function formatCompetencia(comp: string) {
    if (!comp) return comp
    const [year, month] = comp.split("-")
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    return `${months[parseInt(month) - 1]}/${year}`
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Histórico de Acionamentos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Acionamentos concluídos de meses anteriores, arquivados automaticamente no início de cada mês.
        </p>
      </div>

      {/* Filtro por mês */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Competência</label>
          <select
            value={competencia}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[180px]"
          >
            <option value="">Todos os meses</option>
            {months.map((m) => (
              <option key={m} value={m}>{formatCompetencia(m)}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary font-medium">
          <CheckCircle2 className="w-4 h-4" />
          {loading ? "..." : `${rows.length} acionamento${rows.length !== 1 ? "s" : ""}`}
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Carregando...
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <History className="w-8 h-8 opacity-30" />
            <p className="text-sm">Nenhum histórico encontrado.</p>
            <p className="text-xs opacity-60">O histórico é gerado automaticamente no dia 1 de cada mês.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Linha</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cliente</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Operadora</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipo</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Consumo %</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Competência</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Acionado em</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Concluído em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{row.line_number}</td>
                    <td className="px-4 py-3 font-medium">{row.client_name || "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.operator || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.contract_type === "shared"
                          ? "bg-blue-500/10 text-blue-600"
                          : "bg-purple-500/10 text-purple-600"
                      }`}>
                        {row.contract_type === "shared" ? "Compartilhado" : "Individual"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">
                      {Number(row.usage_percentage).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatCompetencia(row.competencia)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {row.triggered_at ? new Date(row.triggered_at).toLocaleDateString("pt-BR") : "-"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {row.marked_as_done_at ? new Date(row.marked_as_done_at).toLocaleDateString("pt-BR") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
