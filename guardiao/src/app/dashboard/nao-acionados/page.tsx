"use client"

import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api"
import {
  AlertCircle, Search, X, UserCheck, CheckCircle, Loader2, Users,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react"

const LIMIT = 25

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
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [from, setFrom]       = useState("")
  const [to, setTo]           = useState("")

  // appliedFrom/appliedTo são o filtro realmente em vigor (o "Filtrar" que
  // aplica) — separado dos campos do formulário, pra virar dependência do
  // useEffect sem disparar busca a cada tecla digitada na data.
  const [appliedFrom, setAppliedFrom] = useState("")
  const [appliedTo, setAppliedTo]     = useState("")
  const [refreshKey, setRefreshKey]   = useState(0)

  const [forwardTarget, setForwardTarget] = useState<SkippedLine | null>(null)
  const [forwarding, setForwarding]       = useState(false)
  const [flash, setFlash]                 = useState<{ msg: string; ok: boolean } | null>(null)

  const [showForwardAll, setShowForwardAll] = useState(false)
  const [forwardingAll, setForwardingAll]   = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  async function fetchRows() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (appliedFrom) params.set("from", appliedFrom)
      if (appliedTo) params.set("to", appliedTo)
      params.set("skip", String((page - 1) * LIMIT))
      params.set("limit", String(LIMIT))
      const res = await apiClient.get(`/skipped-lines?${params.toString()}`)
      setRows(res.data.rows ?? [])
      setTotal(res.data.total ?? 0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRows() }, [page, appliedFrom, appliedTo, refreshKey])

  const resetPage = () => setPage(1)
  const refresh    = () => setRefreshKey((k) => k + 1)

  function handleFilter() {
    setAppliedFrom(from)
    setAppliedTo(to)
    if (page === 1) refresh()
    else resetPage()
  }

  function handleClear() {
    setFrom("")
    setTo("")
    setAppliedFrom("")
    setAppliedTo("")
    if (page === 1) refresh()
    else resetPage()
  }

  function showFlash(msg: string, ok: boolean) {
    setFlash({ msg, ok })
    setTimeout(() => setFlash(null), 4000)
  }

  async function handleForwardConfirm() {
    if (!forwardTarget) return
    setForwarding(true)
    try {
      await apiClient.delete(`/skipped-lines/${forwardTarget.id}`)
      showFlash("Linha encaminhada e removida da lista.", true)
      setForwardTarget(null)
      refresh()
    } catch {
      showFlash("Erro ao encaminhar a linha.", false)
    } finally {
      setForwarding(false)
    }
  }

  async function handleForwardAllConfirm() {
    setForwardingAll(true)
    try {
      const params = new URLSearchParams()
      if (appliedFrom) params.set("from", appliedFrom)
      if (appliedTo) params.set("to", appliedTo)
      const res = await apiClient.delete(`/skipped-lines?${params.toString()}`)
      const count = res.data?.deleted ?? 0
      showFlash(`${count} linha${count !== 1 ? "s" : ""} encaminhada${count !== 1 ? "s" : ""} e removida${count !== 1 ? "s" : ""} da lista.`, true)
      setShowForwardAll(false)
      resetPage()
      refresh()
    } catch {
      showFlash("Erro ao encaminhar as linhas.", false)
    } finally {
      setForwardingAll(false)
    }
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

      {/* Flash */}
      {flash && (
        <div className={`flex items-center gap-3 p-3 rounded-lg text-sm border ${
          flash.ok
            ? "bg-green-500/10 border-green-500/20 text-green-700"
            : "bg-destructive/10 border-destructive/20 text-destructive"
        }`}>
          {flash.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {flash.msg}
        </div>
      )}

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
        {total > 0 && (
          <button
            onClick={() => setShowForwardAll(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity ml-auto"
          >
            <Users className="w-4 h-4" />
            Encaminhar todos
          </button>
        )}
      </div>

      {/* KPI */}
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-600 font-medium">
        <AlertCircle className="w-4 h-4" />
        {loading ? "..." : `${total} linha${total !== 1 ? "s" : ""} encontrada${total !== 1 ? "s" : ""}`}
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
          <>
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
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground w-16">Ações</th>
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
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => setForwardTarget(row)}
                          title="Encaminhar para análise"
                          className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
                        >
                          <UserCheck className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Página <span className="font-medium text-foreground">{page}</span> de <span className="font-medium text-foreground">{totalPages}</span>
            </p>

            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
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

              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          </>
        )}
      </div>

      {/* Modal: Confirmar encaminhamento */}
      {forwardTarget && (
        <div className="fixed inset-0 !mt-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-bold">Encaminhar para análise</h2>
              <button onClick={() => setForwardTarget(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-5">
                {([
                  ["Linha",     forwardTarget.line_number],
                  ["Cliente",   forwardTarget.client_name || "-"],
                  ["Operadora", forwardTarget.operator || "-"],
                  ["Consumo",   `${Number(forwardTarget.usage_percentage).toFixed(2)}%`],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                    <p className="font-medium truncate" title={value}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2.5 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-700 mb-6">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>Essa linha será removida desta lista permanentemente. Confirma que já foi passada para um analista verificar?</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleForwardConfirm}
                  disabled={forwarding}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {forwarding ? "Encaminhando..." : "Confirmar"}
                </button>
                <button
                  onClick={() => setForwardTarget(null)}
                  disabled={forwarding}
                  className="flex-1 py-2.5 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar encaminhar todos */}
      {showForwardAll && (
        <div className="fixed inset-0 !mt-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-bold">Encaminhar todos</h2>
              <button onClick={() => setShowForwardAll(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-start gap-2.5 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-700 mb-6">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  {total} linha{total !== 1 ? "s" : ""}
                  {(appliedFrom || appliedTo) ? " do período filtrado" : ""} será{total !== 1 ? "ão" : ""} removida{total !== 1 ? "s" : ""} desta lista permanentemente.
                  Confirma que já foram passadas para um analista verificar?
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleForwardAllConfirm}
                  disabled={forwardingAll}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {forwardingAll && <Loader2 className="w-4 h-4 animate-spin" />}
                  {forwardingAll ? "Encaminhando..." : "Confirmar"}
                </button>
                <button
                  onClick={() => setShowForwardAll(false)}
                  disabled={forwardingAll}
                  className="flex-1 py-2.5 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
