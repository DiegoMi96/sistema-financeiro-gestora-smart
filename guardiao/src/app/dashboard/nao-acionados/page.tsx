"use client"

import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api"
import { AlertCircle, Search, X } from "lucide-react"

interface SkippedLine {
  id: string
  line_number: string
  client_name: string
  cpf_cnpj: string
  operator: string
  contract_type: string
  quota_mb: number
  used_mb: number
  usage_percentage: number
  competencia: string
  reason: string
  skipped_at: string
}

export default function NaoAcionadosPage() {
  const [rows, setRows]       = useState<SkippedLine[]>([])
  const [loading, setLoading] = useState(true)
  const [from, setFrom]       = useState("")
  const [to, setTo]           = useState("")

  async function fetchRows(f?: string, t?: string) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (f) params.set("from", f)
      if (t) params.set("to", t)
      const res = await apiClient.get(`/skipped-lines?${params.toString()}`)
      setRows(res.data.rows ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRows() }, [])

  function handleFilter() { fetchRows(from, to) }

  function handleClear() {
    setFrom("")
    setTo("")
    fetchRows()
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Linhas Não Acionadas</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Linhas que ultrapassaram o limite mas não foram acionadas por não possuírem pacote de mensageria ativo.
        </p>
      </div>

      {/* Filtro por data */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Data início</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Data fim</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          onClick={handleFilter}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Search className="w-4 h-4" />
          Filtrar
        </button>
        {(from || to) && (
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
          >
            <X className="w-4 h-4" />
            Limpar
          </button>
        )}
      </div>

      {/* KPI */}
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-600 font-medium">
        <AlertCircle className="w-4 h-4" />
        {loading ? "..." : `${rows.length} linha${rows.length !== 1 ? "s" : ""} encontrada${rows.length !== 1 ? "s" : ""}`}
      </div>

      {/* Tabela */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Carregando...
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <AlertCircle className="w-8 h-8 opacity-30" />
            <p className="text-sm">Nenhuma linha encontrada para o período selecionado.</p>
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
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Consumido (MB)</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Consumo %</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Competência</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
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
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {Number(row.used_mb).toFixed(0)} MB
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-yellow-600">
                        {Number(row.usage_percentage).toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.competencia}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(row.skipped_at).toLocaleDateString("pt-BR")}
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
