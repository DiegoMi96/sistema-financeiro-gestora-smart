"use client"

import { useState, useEffect } from "react"
import apiClient from "@/lib/api"
import { Loader, Flame } from "lucide-react"

interface ExtremeUsageLine {
  line_number: string
  client_name: string
  operator: string
  contract_type: string
  usage_percentage: number
  quota_gb: number
  used_gb: number
  competencia: string
  status: string
  triggered_at: string
}

type Filter = "todos" | "individual" | "shared"

export default function AnalisesPage() {
  const [lines, setLines]         = useState<ExtremeUsageLine[]>([])
  const [competencia, setCompetencia] = useState("")
  const [filter, setFilter]       = useState<Filter>("todos")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]         = useState("")

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    setError("")
    try {
      const { data } = await apiClient.get("/analytics/extreme-usage")
      setLines(data.lines ?? [])
      setCompetencia(data.competencia ?? "")
    } catch {
      setError("Erro ao carregar dados.")
    } finally {
      setIsLoading(false)
    }
  }

  const filtered = lines.filter((l) => {
    if (filter === "individual") return l.contract_type === "individual"
    if (filter === "shared")     return l.contract_type === "shared"
    return true
  })

  const formatDate = (raw: string) =>
    new Date(raw).toLocaleDateString("pt-BR")

  const formatCompetencia = (comp: string) => {
    if (!comp) return ""
    const [year, month] = comp.split("-")
    const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]
    return `${months[Number(month) - 1]} ${year}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Análises</h1>
        <p className="text-muted-foreground">
          Linhas que atingiram 1000% ou mais de consumo em{" "}
          <span className="font-medium text-foreground">
            {formatCompetencia(competencia)}
          </span>
        </p>
      </div>

      {/* Filtro de tipo */}
      <div className="flex gap-2">
        {(["todos", "individual", "shared"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted"
            }`}
          >
            {f === "todos"      && "Todos"}
            {f === "individual" && "Individual"}
            {f === "shared"     && "Compartilhado"}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Flame className="w-4 h-4 text-destructive" />
          <span>
            {filtered.length} linha{filtered.length !== 1 ? "s" : ""} acima de 1000%
          </span>
        </div>
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
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <Flame className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
          <p className="font-semibold text-lg">Nenhuma linha acima de 1000%</p>
          <p className="text-muted-foreground text-sm mt-1">
            Nenhuma linha{filter !== "todos" ? ` ${filter === "individual" ? "individual" : "compartilhada"}` : ""} atingiu esse patamar em {formatCompetencia(competencia)}.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-muted border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Linha</th>
                  <th className="px-4 py-3 text-left font-medium">Cliente</th>
                  <th className="px-4 py-3 text-left font-medium">Operadora</th>
                  <th className="px-4 py-3 text-left font-medium">Tipo</th>
                  <th className="px-4 py-3 text-right font-medium">Franquia (GB)</th>
                  <th className="px-4 py-3 text-right font-medium">Usado (GB)</th>
                  <th className="px-4 py-3 text-right font-medium">Consumo</th>
                  <th className="px-4 py-3 text-left font-medium">Acionamento</th>
                  <th className="px-4 py-3 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => (
                  <tr
                    key={`${l.line_number}-${i}`}
                    className="border-b border-border hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{l.line_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.client_name || "—"}</td>
                    <td className="px-4 py-3">{l.operator || "—"}</td>
                    <td className="px-4 py-3">
                      {l.contract_type === "shared" ? "Compartilhado" : "Individual"}
                    </td>
                    <td className="px-4 py-3 text-right">{Number(l.quota_gb).toFixed(1)}</td>
                    <td className="px-4 py-3 text-right">{Number(l.used_gb).toFixed(1)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-destructive">
                        {Number(l.usage_percentage).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {l.triggered_at ? formatDate(l.triggered_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {l.status === "completed" ? (
                        <span className="inline-block px-2 py-1 rounded-full bg-green-500/10 text-green-600 text-xs font-semibold">
                          Resolvido
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-600 text-xs font-semibold">
                          Pendente
                        </span>
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
