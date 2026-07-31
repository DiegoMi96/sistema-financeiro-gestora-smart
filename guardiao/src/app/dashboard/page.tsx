"use client"

import { useState, useEffect } from "react"
import apiClient from "@/lib/api"
import { AlertCircle, CheckCircle, TrendingUp, Loader, RefreshCw } from "lucide-react"
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts"

interface KpiData {
  total_lines: number
  pending_alerts: number
  resolved_today: number
  resolved_month: number
}

interface SnapshotData {
  id: string
  import_date: string
  total_lines: number
  total_alerts: number
}

export default function DashboardV2Page() {
  const [kpis, setKpis] = useState<KpiData>({ total_lines: 0, pending_alerts: 0, resolved_today: 0, resolved_month: 0 })
  const [dailyAlerts, setDailyAlerts]       = useState<any[]>([])
  const [byOperator, setByOperator]         = useState<any[]>([])
  const [byContractType, setByContractType] = useState<any[]>([])
  const [snapshots, setSnapshots]           = useState<SnapshotData[]>([])
  const [isLoading, setIsLoading]           = useState(true)
  const [error, setError]                   = useState("")

  useEffect(() => { fetchDashboardData() }, [])

  const fetchDashboardData = async () => {
    setIsLoading(true)
    try {
      const { data } = await apiClient.get("/dashboard")

      console.log(data)
      setKpis(data.kpis)
      setDailyAlerts(data.daily_alerts        || [])
      setByOperator(data.by_operator          || [])
      setByContractType(data.by_contract_type || [])
      setSnapshots(data.recent_snapshots      || [])
    } catch (err: any) {
      setError("Erro ao carregar dashboard")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Gerencial</h1>
          <p className="text-muted-foreground mt-1">Visão executiva de consumo e acionamentos</p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">Carregando dashboard...</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Linhas Analisadas",      value: kpis.total_lines.toLocaleString(),    icon: "📊" },
              { label: "Pendentes",              value: kpis.pending_alerts.toLocaleString(), icon: <AlertCircle className="w-5 h-5 text-yellow-600" /> },
              { label: "Resolvidos Hoje",        value: kpis.resolved_today.toLocaleString(), icon: <CheckCircle className="w-5 h-5 text-blue-600" /> },
              { label: "Resolvidos no Mês",      value: kpis.resolved_month.toLocaleString(), icon: <TrendingUp className="w-5 h-5 text-green-600" /> },
            ].map((kpi, i) => (
              <div key={i} className="bg-card rounded-lg border border-border p-6">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-sm">
                    {kpi.icon}
                  </div>
                </div>
                <p className="text-3xl font-bold">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="text-lg font-semibold mb-4">Acionamentos Diários (7 dias)</h3>
              {dailyAlerts.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-16">Nenhum dado ainda</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={dailyAlerts}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="alerts" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="text-lg font-semibold mb-4">Distribuição por Tipo de Contrato</h3>
              {byContractType.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-16">Nenhum dado ainda</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={byContractType} cx="50%" cy="50%" outerRadius={80}
                      label={({ name, value }) => `${name}: ${value}`} dataKey="value">
                      {byContractType.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold mb-4">Alertas por Operadora</h3>
            {byOperator.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-16">Nenhum dado ainda</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byOperator}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" /><YAxis />
                  <Tooltip /><Legend />
                  <Bar dataKey="alerts" name="Total"    fill="#3b82f6" />
                  <Bar dataKey="high"   name="Críticos" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Recent Snapshots */}
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="p-6 border-b border-border">
              <h3 className="text-lg font-semibold">Importações Recentes</h3>
            </div>
            {snapshots.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-10">Nenhuma importação ainda</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-muted border-b border-border">
                    <tr>
                      <th className="px-6 py-3 text-left">Data</th>
                      <th className="px-6 py-3 text-right">Linhas</th>
                      <th className="px-6 py-3 text-right">Alertas</th>
                      <th className="px-6 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((s) => (
                      <tr key={s.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-3">{new Date(s.import_date).toLocaleDateString("pt-BR")}</td>
                        <td className="px-6 py-3 text-right">{s.total_lines.toLocaleString()}</td>
                        <td className="px-6 py-3 text-right font-medium">{s.total_alerts}</td>
                        <td className="px-6 py-3">
                          <span className="px-2 py-1 rounded-full bg-green-500/10 text-green-600 text-xs font-semibold">
                            ✓ Sucesso
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
