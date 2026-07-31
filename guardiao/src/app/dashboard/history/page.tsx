"use client"

import { useState, useEffect } from "react"
import apiClient from "@/lib/api"
import {
  Loader, History as HistoryIcon, Search, X,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  CalendarDays,
} from "lucide-react"

interface AlertEntry {
  id: string
  line_number: string
  client_name: string
  triggered_at: string
}

const LIMIT = 20

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
]

function formatCompetencia(comp: string) {
  if (!comp) return ""
  const [year, month] = comp.split("-")
  return `${MONTHS[Number(month) - 1]} de ${year}`
}

function formatDate(raw: string) {
  return new Date(raw).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

function prevMonth(comp: string) {
  const [y, m] = comp.split("-").map(Number)
  const d = new Date(y, m - 2)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function nextMonth(comp: string) {
  const [y, m] = comp.split("-").map(Number)
  const d = new Date(y, m)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default function HistoryPage() {
  const currentCompetencia = new Date().toISOString().slice(0, 7)

  const [entries, setEntries]         = useState<AlertEntry[]>([])
  const [total, setTotal]             = useState(0)
  const [competencia, setCompetencia] = useState(currentCompetencia)
  const [lineNumber, setLineNumber]   = useState("")
  const [lineInput, setLineInput]     = useState("")
  const [page, setPage]               = useState(1)
  const [isLoading, setIsLoading]     = useState(true)
  const [error, setError]             = useState("")

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const isCurrentMonth = competencia === currentCompetencia

  useEffect(() => { fetchHistory() }, [competencia, lineNumber, page])

  const fetchHistory = async () => {
    setIsLoading(true)
    setError("")
    try {
      const { data } = await apiClient.get("/alerts", {
        params: {
          paginated: "true",
          competencia,
          line_number: lineNumber || undefined,
          skip: (page - 1) * LIMIT,
          limit: LIMIT,
        },
      })
      setEntries(data.data ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setError("Erro ao carregar histórico.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = () => { setLineNumber(lineInput.trim()); setPage(1) }
  const clearSearch  = () => { setLineInput(""); setLineNumber(""); setPage(1) }
  const setMonth     = (val: string) => { setCompetencia(val); setPage(1) }

  const from = total === 0 ? 0 : (page - 1) * LIMIT + 1
  const to   = Math.min(page * LIMIT, total)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">Histórico de Acionamentos</h1>
          <p className="text-muted-foreground">
            Linhas acionadas em <span className="font-medium text-foreground">{formatCompetencia(competencia)}</span>
          </p>
        </div>
        {!isLoading && total > 0 && (
          <div className="flex-shrink-0 bg-primary/10 text-primary px-4 py-2 rounded-xl text-sm font-semibold">
            {total} acionamento{total !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap gap-4 items-end">

        {/* Mês com navegação */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" /> Mês de referência
          </label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMonth(prevMonth(competencia))}
              className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
              title="Mês anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="month"
              value={competencia}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
            <button
              onClick={() => setMonth(nextMonth(competencia))}
              disabled={isCurrentMonth}
              className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-30"
              title="Próximo mês"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Busca por linha */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-[220px]">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" /> Número da linha
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Ex: 11999998888"
                value={lineInput}
                onChange={(e) => setLineInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full pl-3 pr-8 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              {lineInput && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={handleSearch}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Search className="w-4 h-4" />
              Buscar
            </button>
          </div>
        </div>

      </div>

      {/* Chip de filtro ativo */}
      {lineNumber && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium w-fit">
          Linha: {lineNumber}
          <button onClick={clearSearch}><X className="w-3 h-3" /></button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive rounded-xl text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Conteúdo */}
      {isLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">Carregando histórico...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <HistoryIcon className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
          <p className="font-semibold text-lg">Nenhum acionamento encontrado</p>
          <p className="text-muted-foreground text-sm mt-1">
            Sem registros para {formatCompetencia(competencia)}
            {lineNumber ? ` com a linha "${lineNumber}"` : ""}.
          </p>
          {lineNumber && (
            <button onClick={clearSearch} className="mt-4 text-sm text-muted-foreground hover:underline font-bold">
              Limpar filtro de linha
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Tabela */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-muted border-b border-border">
                  <tr>
                    <th className="px-6 py-3.5 text-left font-medium text-muted-foreground">#</th>
                    <th className="px-6 py-3.5 text-left font-medium text-muted-foreground">Número da Linha</th>
                    <th className="px-6 py-3.5 text-left font-medium text-muted-foreground">Cliente</th>
                    <th className="px-6 py-3.5 text-left font-medium text-muted-foreground">Data do Acionamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((e, i) => (
                    <tr key={e.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-6 py-4 text-muted-foreground text-xs">{(page - 1) * LIMIT + i + 1}</td>
                      <td className="px-6 py-4 font-medium text-xs">{e.line_number}</td>
                      <td className="px-6 py-4 text-muted-foreground">{e.client_name || "—"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{e.triggered_at ? formatDate(e.triggered_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação dentro do card */}
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-border">
              <p className="text-sm text-muted-foreground">
                {from}–{to} de <span className="font-medium text-foreground">{total}</span>
              </p>

              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                  const p = start + i
                  return p <= totalPages ? (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        page === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}>
                      {p}
                    </button>
                  ) : null
                })}

                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>

              <p className="text-sm text-muted-foreground">
                Página <span className="font-medium text-foreground">{page}</span> de{" "}
                <span className="font-medium text-foreground">{totalPages}</span>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
