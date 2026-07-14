import { useState } from 'react'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LabelList, Cell,
} from 'recharts'
import { Download } from 'lucide-react'
import api from '../../services/api'

const fmt  = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtK = v => { const n = Number(v || 0); return n >= 1000 ? `R$${(n/1000).toFixed(0)}K` : fmt(n) }

/**
 * WeeklyProgress — Planejado vs Realizado por semana (analista)
 * Props:
 *   weekData: { W1: {planejado, realizado, label}, W2: ... }
 */
export function WeeklyProgress({ weekData }) {
  const WEEKS = weekData && Object.keys(weekData).length > 0
    ? Object.fromEntries(
        Object.entries(weekData).map(([k, v]) => [
          k, { label: v.label || k, planned: v.planejado || 0, realized: v.realizado || 0 },
        ])
      )
    : {
        W1: { label: '01–07', planned: 0, realized: 0 },
        W2: { label: '08–14', planned: 0, realized: 0 },
        W3: { label: '15–21', planned: 0, realized: 0 },
        W4: { label: '22–28', planned: 0, realized: 0 },
      }

  const chartData = Object.entries(WEEKS).map(([k, v]) => ({
    semana: `${k}\n${v.label}`,
    key: k,
    Planejado: v.planned,
    Realizado: v.realized,
  }))

  const totalPlan = Object.values(WEEKS).reduce((s, v) => s + v.planned, 0)
  const totalReal = Object.values(WEEKS).reduce((s, v) => s + v.realized, 0)
  const pct = totalPlan > 0 ? Math.min(100, Math.round((totalReal / totalPlan) * 100)) : 0

  return (
    <div className="gs-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="gs-section-title">Planejado vs Realizado</h2>
        <span className="text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-lg">
          {pct}% do mês
        </span>
      </div>

      <div className="flex gap-6 mb-4">
        <div>
          <p className="text-xs text-gray-400">Planejado</p>
          <p className="text-sm font-bold text-gray-700">{fmt(totalPlan)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Realizado</p>
          <p className="text-sm font-bold text-green-700">{fmt(totalReal)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Diferença</p>
          <p className={`text-sm font-bold ${totalReal >= totalPlan ? 'text-emerald-600' : 'text-red-500'}`}>
            {totalReal >= totalPlan ? '+' : ''}{fmt(totalReal - totalPlan)}
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
            tickFormatter={v => `R$${(v / 1000).toFixed(0)}K`} width={44} />
          <Tooltip formatter={v => [fmt(v)]} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #EBEBEB' }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="Planejado" fill="#94D4A0" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Realizado" fill="#3CB54A" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400">
              <th className="text-left pb-1.5">Semana</th>
              <th className="text-right pb-1.5">Planejado</th>
              <th className="text-right pb-1.5">Realizado</th>
              <th className="text-right pb-1.5">%</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(WEEKS).map(([k, v]) => {
              const p = v.planned > 0 ? Math.round((v.realized / v.planned) * 100) : 0
              return (
                <tr key={k} className="border-t border-gray-50 text-gray-600">
                  <td className="py-1">{k} · {v.label}</td>
                  <td className="py-1 text-right">{fmt(v.planned)}</td>
                  <td className="py-1 text-right">{fmt(v.realized)}</td>
                  <td className={`py-1 text-right font-semibold ${p >= 100 ? 'text-emerald-600' : p > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                    {v.planned > 0 ? (v.realized > 0 ? `${p}%` : '—') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * DailyAccumulated — Acumulado diário (analista)
 * Props:
 *   data: [{dia: "01", Planejado: X, Realizado: Y}, ...]
 *   month, year: para exportação detalhada
 */
export function DailyAccumulated({ data, month, year }) {
  const [exporting, setExporting] = useState(false)
  const chartData = data && data.length > 0 ? data : []

  const fmtDate = iso => iso ? iso.slice(8,10) + '/' + iso.slice(5,7) + '/' + iso.slice(0,4) : '—'

  async function handleExport() {
    setExporting(true)
    try {
      const res = await api.get(`/analyst/acumulado-detail?month=${month}&year=${year}`)
      const rows = res.data?.rows || []
      const bom = '﻿'
      const header = 'Cliente;Vencimento;Pagamento;Valor;Banco\n'
      const lines = rows.map(r => {
        const val = Number(r.valor || 0).toFixed(2).replace('.', ',')
        return `"${r.nome}";"${fmtDate(r.vencimento)}";"${fmtDate(r.pagamento)}";"${val}";"${r.banco}"`
      }).join('\n')
      const blob = new Blob([bom + header + lines], { type: 'text/csv;charset=utf-8' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `acumulado_${String(year)}_${String(month).padStart(2,'0')}.csv`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch { /* silent */ } finally {
      setExporting(false)
    }
  }

  return (
    <div className="gs-card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="gs-section-title">Acumulado diário</h2>
        {chartData.length > 0 && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#3CB54A] border border-gray-200 hover:border-[#3CB54A] rounded-lg px-3 py-1.5 transition-colors"
          >
            <Download size={13} />
            {exporting ? 'Exportando...' : 'Exportar'}
          </button>
        )}
      </div>
      {chartData.length > 0 ? (
        <div className="flex-1 min-h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradPlan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#94a3b8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3CB54A" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3CB54A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#F3F4F6" vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
              tickFormatter={v => `R$${(v / 1000).toFixed(0)}K`} />
            <Tooltip formatter={v => [fmt(v)]} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #E8EAED' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="Planejado" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" fill="url(#gradPlan)" dot={false} />
            <Area type="monotone" dataKey="Realizado" stroke="#3CB54A" strokeWidth={2.5} fill="url(#gradReal)" dot={false} activeDot={{ r: 4, fill: '#3CB54A' }} />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex items-center justify-center h-64">
          <p className="text-xs text-gray-400">Aguardando dados do Asaas para este mês.</p>
        </div>
      )}
    </div>
  )
}

/**
 * DailyReceived — Recebido diário (barras por dia)
 * Props:
 *   data: [{dia: "01", planejado: X, realizado: Y}, ...]
 */
export function DailyReceived({ data }) {
  const chartData = (data && data.length > 0 ? data : []).map(d => ({
    dia:       d.dia,
    Planejado: d.planejado || 0,
    Recebido:  d.realizado || 0,
  }))

  const totalPlan = chartData.reduce((s, d) => s + d.Planejado, 0)
  const totalReal = chartData.reduce((s, d) => s + d.Recebido,  0)
  const pct = totalPlan > 0 ? Math.min(100, Math.round((totalReal / totalPlan) * 100)) : 0

  return (
    <div className="gs-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="gs-section-title">Recebimento Diário</h2>
          <p className="text-xs text-gray-400 mt-0.5">Planejado vs recebido por dia (base caixa)</p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-xs text-gray-400">Planejado</p>
            <p className="text-sm font-bold text-gray-600">{fmt(totalPlan)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Recebido</p>
            <p className="text-sm font-bold text-emerald-700">{fmt(totalReal)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Realizado</p>
            <p className={`text-sm font-bold ${pct >= 100 ? 'text-emerald-600' : pct > 0 ? 'text-green-600' : 'text-gray-400'}`}>{pct}%</p>
          </div>
        </div>
      </div>

      {chartData.length > 0 && (totalPlan > 0 || totalReal > 0) ? (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%" barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="dia"
              tick={{ fontSize: 8, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => v >= 1000 ? `R$${(v/1000).toFixed(0)}K` : `R$${v}`}
              width={46}
            />
            <Tooltip
              formatter={(v, name) => [fmt(v), name]}
              contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #E8EAED' }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="Planejado" fill="#94D4A0" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Recebido"  fill="#3CB54A" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-44">
          <p className="text-xs text-gray-400">Nenhum dado disponível para este mês.</p>
        </div>
      )}
    </div>
  )
}

/**
 * WeeklyProgressAdmin — Planejado vs Realizado (gestor)
 * Props:
 *   weekData: { W1: {planejado, realizado, label}, ... }
 */
export function WeeklyProgressAdmin({ weekData }) {
  const WEEKS = weekData && Object.keys(weekData).length > 0
    ? Object.fromEntries(
        Object.entries(weekData).map(([k, v]) => [
          k,
          { label: v.label || k, planned: v.planejado || 0, realized: v.realizado || 0 },
        ])
      )
    : {
        W1: { label: '01–07', planned: 0, realized: 0 },
        W2: { label: '08–14', planned: 0, realized: 0 },
        W3: { label: '15–21', planned: 0, realized: 0 },
        W4: { label: '22–28', planned: 0, realized: 0 },
      }

  const weekChartData = Object.entries(WEEKS).map(([k, v]) => ({
    semana: `${k}\n${v.label}`,
    Planejado: v.planned,
    Realizado: v.realized,
  }))

  const total = Object.values(WEEKS).reduce((acc, v) => ({
    planned:  acc.planned  + v.planned,
    realized: acc.realized + v.realized,
  }), { planned: 0, realized: 0 })

  const pctTotal = total.planned > 0 ? Math.round((total.realized / total.planned) * 100) : 0

  return (
    <div className="gs-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="gs-section-title">Planejado vs Realizado</h2>
        <span className="text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-lg">
          {pctTotal}% do mês
        </span>
      </div>
      <div className="flex gap-6 mb-4">
        <div>
          <p className="text-xs text-gray-400">Planejado</p>
          <p className="text-sm font-bold text-gray-700">{fmt(total.planned)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Realizado</p>
          <p className="text-sm font-bold text-green-700">{fmt(total.realized)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Diferença</p>
          <p className={`text-sm font-bold ${total.realized >= total.planned ? 'text-emerald-600' : 'text-red-500'}`}>
            {total.realized >= total.planned ? '+' : ''}{fmt(total.realized - total.planned)}
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={weekChartData} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="semana" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
            tickFormatter={v => `R$${(v / 1000).toFixed(0)}K`} />
          <Tooltip formatter={v => [fmt(v)]} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #EBEBEB' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Planejado" fill="#94D4A0" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="Planejado" position="top" formatter={v => v > 0 ? fmtK(v) : ''} style={{ fontSize: 9, fill: '#94a3b8' }} />
          </Bar>
          <Bar dataKey="Realizado" fill="#3CB54A" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="Realizado" position="top" formatter={v => v > 0 ? fmtK(v) : ''} style={{ fontSize: 9, fill: '#3CB54A' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400">
              <th className="text-left pb-1.5">Semana</th>
              <th className="text-right pb-1.5">Planejado</th>
              <th className="text-right pb-1.5">Realizado</th>
              <th className="text-right pb-1.5">%</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(WEEKS).map(([k, v]) => {
              const p = v.planned > 0 ? Math.round((v.realized / v.planned) * 100) : 0
              return (
                <tr key={k} className="border-t border-gray-50 text-gray-600">
                  <td className="py-1">{k} · {v.label}</td>
                  <td className="py-1 text-right">{fmt(v.planned)}</td>
                  <td className="py-1 text-right">{fmt(v.realized)}</td>
                  <td className={`py-1 text-right font-semibold ${p >= 100 ? 'text-emerald-600' : p > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                    {v.planned > 0 ? (v.realized > 0 ? `${p}%` : '—') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
