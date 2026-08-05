"use client"

import { useState, useEffect } from "react"
import { apiClient } from "@/lib/api"
import {
  Mail, CheckCircle, AlertCircle, Loader, RefreshCw, Clock, Info,
  MessageSquare, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react"

const LIMIT = 25

interface EmailLog {
  id: string
  email: string
  event: string
  subject: string | null
  from_email: string | null
  message_id: string | null
  template_id: number | null
  event_at: string
}

interface EmailSummary {
  total_recipients: number
  total_sent: number
  total_errors: number
}

interface SmsLog {
  id: string
  campaign_id: string
  phone: string
  content: string
  provider_message_id: string | null
  success: boolean
  response_code: string | null
  response_description: string | null
  competencia: string
  sent_at: string
}

interface SmsSummary {
  total: number
  total_success: number
  total_failed: number
}

const EVENT_LABEL: Record<string, { label: string; color: string }> = {
  sent: { label: "Enviado", color: "bg-green-500/10 text-green-600" },
  error: { label: "Falha", color: "bg-red-500/10 text-red-600" },
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function formatDate() {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-border">
      <p className="text-sm text-muted-foreground">
        Página <span className="font-medium text-foreground">{page}</span> de <span className="font-medium text-foreground">{totalPages}</span>
      </p>

      <div className="flex items-center gap-1">
        <button onClick={() => onChange(1)} disabled={page === 1}
          className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
          className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>

        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const start = Math.max(1, Math.min(page - 2, totalPages - 4))
          const p = start + i
          return p <= totalPages ? (
            <button key={p} onClick={() => onChange(p)}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                page === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}>
              {p}
            </button>
          ) : null
        })}

        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => onChange(totalPages)} disabled={page === totalPages}
          className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

type Tab = "email" | "sms"

export default function EnviosPage() {
  const [activeTab, setActiveTab] = useState<Tab>("email")

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-1">Histórico de Envios Diário</h1>
        <p className="text-muted-foreground capitalize">{formatDate()}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("email")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "email"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
        >
          <Mail className="w-4 h-4" />
          E-mail (Brevo)
        </button>
        <button
          onClick={() => setActiveTab("sms")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "sms"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
        >
          <MessageSquare className="w-4 h-4" />
          SMS
        </button>
      </div>

      {activeTab === "email" ? <EmailTab /> : <SmsTab />}
    </div>
  )
}

function EmailTab() {
  const [rows, setRows] = useState<EmailLog[]>([])
  const [summary, setSummary] = useState<EmailSummary | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const fetchHistory = async () => {
    setIsLoading(true)
    setError("")
    try {
      const res = await apiClient.get("/email-logs", { params: { skip: (page - 1) * LIMIT, limit: LIMIT } })
      setRows(res.data.rows ?? [])
      setSummary(res.data.summary ?? null)
      setTotal(res.data.total ?? 0)
      setLastRefresh(new Date())
    } catch {
      setError("Erro ao carregar histórico de e-mails.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchHistory() }, [page])

  const tableEvents = rows

  return (
    <div className="space-y-6">
      {/* Refresh */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <p className="text-xs text-muted-foreground/60">
          Última atualização: {lastRefresh.toLocaleTimeString("pt-BR")}
        </p>
        <button
          onClick={fetchHistory}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl text-sm">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-muted-foreground">
          São exibidos apenas os emails enviados <span className="font-medium text-foreground">hoje</span> pelo Guardião.
          O histórico é limpo automaticamente à meia-noite.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Destinatários", value: summary?.total_recipients ?? 0, icon: Mail, color: "text-blue-600", bg: "bg-blue-500/10" },
          { label: "Enviados", value: summary?.total_sent ?? 0, icon: CheckCircle, color: "text-green-600", bg: "bg-green-500/10" },
          { label: "Erros", value: summary?.total_errors ?? 0, icon: AlertCircle, color: "text-red-600", bg: "bg-red-500/10" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">{label}</p>
              <div className={`p-2 rounded-lg ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold">{isLoading ? "—" : value}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">Buscando envios de hoje...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
          {error}
        </div>
      ) : tableEvents.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <Mail className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
          <p className="font-semibold text-lg">Nenhum envio hoje</p>
          <p className="text-muted-foreground text-sm mt-1">Os emails enviados pelo Guardião aparecerão aqui.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-muted border-b border-border">
                <tr>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Horário</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Destinatário</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Remetente</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tableEvents.map((ev) => {
                  const badge = EVENT_LABEL[ev.event] ?? { label: ev.event, color: "bg-muted text-muted-foreground" }
                  return (
                    <tr key={ev.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-5 py-3.5 text-muted-foreground text-xs flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {formatTime(ev.event_at)}
                      </td>
                      <td className="px-5 py-3.5 font-medium">{ev.email}</td>
                      <td className="px-5 py-3.5 text-muted-foreground text-xs">{ev.from_email ?? "—"}</td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  )
}

function SmsTab() {
  const [rows, setRows] = useState<SmsLog[]>([])
  const [summary, setSummary] = useState<SmsSummary | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  async function fetchRows() {
    setLoading(true)
    try {
      const res = await apiClient.get(`/sms-logs`, { params: { skip: (page - 1) * LIMIT, limit: LIMIT } })
      setRows(res.data.rows ?? [])
      setSummary(res.data.summary ?? null)
      setTotal(res.data.total ?? 0)
      setLastRefresh(new Date())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRows() }, [page])

  return (
    <div className="space-y-6">
      {/* Refresh */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <p className="text-xs text-muted-foreground/60">
          Última atualização: {lastRefresh.toLocaleTimeString("pt-BR")}
        </p>
        <button
          onClick={fetchRows}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl text-sm">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-muted-foreground">
          São exibidos apenas os SMS enviados <span className="font-medium text-foreground">hoje</span> pela campanha Guardião.
          O histórico é limpo automaticamente à meia-noite.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Envios", value: summary?.total ?? 0, icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-500/10" },
          { label: "Enviados", value: summary?.total_success ?? 0, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-500/10" },
          { label: "Falhas", value: summary?.total_failed ?? 0, icon: XCircle, color: "text-red-600", bg: "bg-red-500/10" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">{label}</p>
              <div className={`p-2 rounded-lg ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold">{loading ? "—" : value}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">Buscando envios do período...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
          <p className="font-semibold text-lg">Nenhum SMS enviado</p>
          <p className="text-muted-foreground text-sm mt-1">Os SMS enviados pelo Guardião neste mês aparecerão aqui.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-muted border-b border-border">
                <tr>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Telefone</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">ID Provedor</th>
                  <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Enviado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs">{row.phone}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${row.success
                          ? "bg-green-500/10 text-green-600"
                          : "bg-red-500/10 text-red-600"
                        }`}>
                        {row.success ? "Enviado" : "Falha"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{row.provider_message_id || "-"}</td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">
                      {new Date(row.sent_at).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
