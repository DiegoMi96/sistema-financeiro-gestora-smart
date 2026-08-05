"use client"

import { useState, useEffect } from "react"
import apiClient from "@/lib/api"
import { Alert } from "@/types"
import {
  AlertCircle, CheckCircle, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Download, CheckSquare,
  Loader, Loader2, X, Eye, BadgeCheck,
} from "lucide-react"

const LIMIT = 25

export default function AlertsPage() {
  const [alerts, setAlerts]         = useState<Alert[]>([])
  const [total, setTotal]           = useState(0)
  const [isLoading, setIsLoading]   = useState(true)
  const [markingAll, setMarkingAll] = useState(false)
  const [exporting, setExporting]   = useState(false)
  const [flash, setFlash]           = useState<{ msg: string; ok: boolean } | null>(null)

  const [status, setStatus]             = useState<"pending" | "completed">("pending")
  const [contractType, setContractType] = useState<"" | "individual" | "shared">("")
  const [page, setPage]                 = useState(1)

  const [selectedAlert, setSelectedAlert]     = useState<Alert | null>(null)
  const [confirmSingle, setConfirmSingle]     = useState<Alert | null>(null)
  const [showConfirm, setShowConfirm]         = useState(false)
  const [notEmailed, setNotEmailed]           = useState<{ line_number: string; client_name: string }[]>([])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const skip       = (page - 1) * LIMIT

  useEffect(() => { fetchAlerts() }, [status, contractType, page])

  const fetchAlerts = async () => {
    setIsLoading(true)
    try {
      const params: Record<string, any> = { status, skip, limit: LIMIT, paginated: "true" }
      if (contractType) params.contract_type = contractType
      const { data } = await apiClient.get("/alerts", { params })
      setAlerts(data.data ?? data)
      setTotal(data.total ?? data.length)
    } catch {
      showFlash("Erro ao carregar acionamentos", false)
    } finally {
      setIsLoading(false)
    }
  }

  const showFlash = (msg: string, ok: boolean) => {
    setFlash({ msg, ok })
    setTimeout(() => setFlash(null), 4000)
  }

  const resetPage = () => setPage(1)

  const handleMarkAsDone = async (alertId: string) => {
    try {
      const res = await apiClient.patch(`/alerts/${alertId}`, { status: "completed" })
      setSelectedAlert(null)
      setConfirmSingle(null)
      await fetchAlerts()
      if (res.data.blocked) {
        setNotEmailed(res.data.not_emailed)
      } else {
        showFlash("Acionamento concluído.", true)
      }
    } catch {
      showFlash("Erro ao marcar como concluído.", false)
    }
  }

  const handleMarkAll = async () => {
    setMarkingAll(true)
    setShowConfirm(false)
    try {
      const body: Record<string, string> = {}
      if (contractType) body.contract_type = contractType
      const res = await apiClient.post("/alerts/bulk-complete", body)
      resetPage()
      await fetchAlerts()
      if (res.data.not_emailed?.length > 0) setNotEmailed(res.data.not_emailed)
      if (res.data.updated > 0) showFlash(res.data.message, true)
    } catch {
      showFlash("Erro ao marcar acionamentos.", false)
    } finally {
      setMarkingAll(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams({ status })
      if (contractType) params.append("contract_type", contractType)
      const response = await fetch(`/api/alerts/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
      })
      if (!response.ok) throw new Error()
      const blob = await response.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `acionamentos_${status}_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      showFlash("Erro ao exportar Excel.", false)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">Acionamentos</h1>
          <p className="text-muted-foreground">Gerencie os acionamentos de consumo de franquia</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleExport}
            disabled={exporting || isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar Excel
          </button>
          {status === "pending" && (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={markingAll || alerts.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {markingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
              Concluir todos pendentes
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["pending", "completed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); resetPage() }}
            className={`flex items-center gap-2 px-5 py-2.5 border-b-2 text-sm font-medium transition-colors -mb-px ${
              status === s
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "pending"
              ? <><AlertCircle className="w-4 h-4" /> Pendentes</>
              : <><CheckCircle className="w-4 h-4" /> Concluídos</>}
          </button>
        ))}
      </div>

      {/* Filtro de tipo */}
      <div className="flex gap-2">
        {([
          { value: "",           label: "Todos" },
          { value: "individual", label: "Individual" },
          { value: "shared",     label: "Compartilhado" },
        ] as const).map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setContractType(opt.value); resetPage() }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              contractType === opt.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
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

      {/* Tabela */}
      {isLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">Carregando acionamentos...</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
          <p className="font-semibold text-lg">Nenhum acionamento encontrado</p>
          <p className="text-muted-foreground text-sm mt-1">
            {contractType ? `Sem resultados para o tipo "${contractType === "shared" ? "Compartilhado" : "Individual"}"` : "Tudo em dia por aqui."}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-muted border-b border-border">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Linha</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Cliente</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Operadora</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Tipo</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Consumo</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Competência</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground w-28">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-5 py-3.5 text-xs">{alert.line_number}</td>
                    <td className="px-5 py-3.5 max-w-[180px] truncate" title={alert.client_name}>{alert.client_name}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{alert.operator}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        (alert as any).contract_type === "shared"
                          ? "bg-purple-500/10 text-purple-600"
                          : "bg-blue-500/10 text-blue-600"
                      }`}>
                        {(alert as any).contract_type === "shared" ? "Compartilhado" : "Individual"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`font-semibold ${
                        Number(alert.usage_percentage) >= 300 ? "text-red-600" :
                        Number(alert.usage_percentage) >= 150 ? "text-orange-500" : "text-yellow-600"
                      }`}>
                        {Number(alert.usage_percentage).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{alert.competencia}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setSelectedAlert(alert)}
                          title="Ver detalhes"
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {/* {alert.status === "pending" && (
                          <button
                            onClick={() => setConfirmSingle(alert)}
                            title="Marcar como acionado"
                            className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
                          >
                            <BadgeCheck className="w-4 h-4" />
                          </button>
                        )} */}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Página <span className="font-medium text-foreground">{page}</span> de <span className="font-medium text-foreground">{totalPages}</span>
            </p>

            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
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

              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalhes */}
      {selectedAlert && (
        <div className="fixed inset-0 !mt-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-bold">Detalhes do Acionamento</h2>
              <button onClick={() => setSelectedAlert(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm mb-6">
                {([
                  ["Linha",       selectedAlert.line_number],
                  ["Cliente",     selectedAlert.client_name],
                  ["CPF/CNPJ",    (selectedAlert as any).cpf_cnpj || "-"],
                  ["Operadora",   selectedAlert.operator],
                  ["Tipo",        (selectedAlert as any).contract_type === "shared" ? "Compartilhado" : "Individual"],
                  ["Consumo",     `${Number(selectedAlert.usage_percentage).toFixed(2)}%`],
                  ["Franquia",    `${(selectedAlert as any).quota_mb ?? "-"} MB`],
                  ["Competência", selectedAlert.competencia],
                  ["Status",      selectedAlert.status === "pending" ? "Pendente" : "Concluído"],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                    <p className="font-medium truncate" title={value}>{value}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setSelectedAlert(null)}
                className="w-full py-2.5 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar marcar acionamento individual */}
      {confirmSingle && (
        <div className="fixed inset-0 !mt-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-bold">Confirmar acionamento</h2>
              <button onClick={() => setConfirmSingle(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-muted-foreground mb-1">
                Linha <span className="font-semibold text-foreground">{confirmSingle.line_number}</span>
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                Confirma que esta linha foi acionada? A ação não pode ser desfeita.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleMarkAsDone(confirmSingle.id)}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setConfirmSingle(null)}
                  className="flex-1 py-2.5 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Clientes sem email cadastrado */}
      {notEmailed.length > 0 && (
        <div className="fixed inset-0 !mt-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-bold">Acionamento não concluído</h2>
              <button onClick={() => setNotEmailed([])} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-muted-foreground mb-4">
                Os acionamentos abaixo <strong className="text-foreground">não foram concluídos</strong> pois o cliente não está cadastrado ou não possui e-mail. Cadastre-os e tente novamente.
              </p>
              <ul className="space-y-2 mb-6 max-h-56 overflow-y-auto">
                {notEmailed.map((item) => (
                  <li key={item.line_number} className="flex items-center gap-3 p-3 bg-muted rounded-lg text-sm">
                    <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                    <div>
                      <p className="font-medium">{item.client_name}</p>
                      <p className="text-xs text-muted-foreground">{item.line_number}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setNotEmailed([])}
                className="w-full py-2.5 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar marcar todas */}
      {showConfirm && (
        <div className="fixed inset-0 !mt-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-bold">Confirmar ação</h2>
              <button onClick={() => setShowConfirm(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-muted-foreground mb-6">
                Todos os acionamentos pendentes
                {contractType ? ` do tipo "${contractType === "shared" ? "Compartilhado" : "Individual"}"` : ""}
                {" "}serão marcados como concluídos. Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3">
                <button onClick={handleMarkAll}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90">
                  Confirmar
                </button>
                <button onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2.5 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80">
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

