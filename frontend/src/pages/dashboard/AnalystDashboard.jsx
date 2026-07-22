import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts'
import { AlertTriangle, Clock, Edit2, DollarSign, FileText, ExternalLink,
  TrendingUp, CheckCircle, TrendingDown, Percent, Upload, ChevronRight, X, Users, Download } from 'lucide-react'
import { WeeklyProgress, DailyAccumulated, DailyReceived } from '../../components/dashboard/WeeklyProgressCards'

const fmt   = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtK  = v => { const n = Number(v||0); return n >= 1000 ? `R$ ${(n/1000).toFixed(1)}K` : fmt(n) }
const fmtN  = v => Number(v || 0).toLocaleString('pt-BR')
const fmtD  = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
const VERDE    = '#22C55E'
const VERMELHO = '#EF4444'
const AZUL     = '#3B82F6'
const AMBAR    = '#D97706'

const BUCKET_COLOR = {
  '1–4 dias':   'bg-yellow-100 text-yellow-700',
  '5–7 dias':   'bg-orange-100 text-orange-700',
  '8–15 dias':  'bg-red-100 text-red-700',
  '15–30 dias': 'bg-red-200 text-red-800',
  '> 31 dias':  'bg-red-300 text-red-900',
}

const MONTHS_PT = [
  { value: 1, label: 'Janeiro' }, { value: 2,  label: 'Fevereiro' },
  { value: 3, label: 'Março' },   { value: 4,  label: 'Abril' },
  { value: 5, label: 'Maio' },    { value: 6,  label: 'Junho' },
  { value: 7, label: 'Julho' },   { value: 8,  label: 'Agosto' },
  { value: 9, label: 'Setembro'}, { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro'},{ value: 12, label: 'Dezembro' },
]

function ListaVencidos({ rows, month, year }) {
  const [search,  setSearch]  = useState('')
  const [sortCol, setSortCol] = useState('valor')
  const [sortDir, setSortDir] = useState('desc')
  const [notes,   setNotes]   = useState({})
  const [saving,  setSaving]  = useState({})

  useEffect(() => {
    if (!month || !year) return
    const token = localStorage.getItem('token')
    fetch(`/api/analyst/vencidos-notas?mes=${month}&ano=${year}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : {})
      .then(data => setNotes(data || {}))
      .catch(() => {})
  }, [month, year])

  const rawCnpj = cnpj => (cnpj || '').replace(/\D/g, '')

  function getNota(cnpj, field) {
    return notes[rawCnpj(cnpj)]?.[field] ?? ''
  }

  function setNota(cnpj, field, value) {
    const key = rawCnpj(cnpj)
    setNotes(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }))
  }

  async function saveNota(cnpj) {
    const key = rawCnpj(cnpj)
    if (!key) return
    setSaving(prev => ({ ...prev, [key]: true }))
    const token = localStorage.getItem('token')
    const nota = notes[key] || {}
    try {
      await fetch(`/api/analyst/vencidos-notas/${key}?mes=${month}&ano=${year}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          vencimento_planejado: nota.vencimento_planejado || null,
          observacao: nota.observacao || null,
        }),
      })
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }))
    }
  }

  const handleSort = (key) => {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(key); setSortDir('asc') }
  }
  const SortIcon = ({ col }) => (
    <span className="text-gray-400 ml-0.5">
      {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )

  const STR_COLS = new Set(['nome', 'banco', 'email', 'description', 'vencimento_planejado', 'observacao'])

  const base = search.trim()
    ? rows.filter(r => r.nome.toLowerCase().includes(search.toLowerCase()))
    : rows

  const filtered = [...base].sort((a, b) => {
    let av, bv
    if (sortCol === 'vencimento_planejado') {
      av = notes[rawCnpj(a.cnpj)]?.vencimento_planejado ?? ''
      bv = notes[rawCnpj(b.cnpj)]?.vencimento_planejado ?? ''
    } else if (sortCol === 'observacao') {
      av = notes[rawCnpj(a.cnpj)]?.observacao ?? ''
      bv = notes[rawCnpj(b.cnpj)]?.observacao ?? ''
    } else {
      av = a[sortCol] ?? ''
      bv = b[sortCol] ?? ''
    }
    if (STR_COLS.has(sortCol)) {
      return sortDir === 'asc' ? String(av).localeCompare(String(bv), 'pt-BR') : String(bv).localeCompare(String(av), 'pt-BR')
    }
    return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av)
  })

  const BANCO_BADGE = {
    Asaas: 'bg-green-100 text-green-700',
    Itaú:  'bg-blue-100 text-blue-700',
  }

  const thSort = (key, align = 'text-left') =>
    `${align} py-2 px-4 cursor-pointer select-none hover:text-gray-600`

  const displayed = search.trim() ? filtered : filtered.slice(0, 10)

  function downloadCsvVencidos() {
    const bom    = '﻿'
    const header = '#;Cliente;CNPJ;Banco;Email;Descrição Boleto;1º Vencimento;Valor Vencido (R$);Dias;Venc. Planejado;Observação\n'
    const body   = displayed.map((r, i) => {
      const venc = r.vencimento_orig
        ? r.vencimento_orig.slice(8,10) + '/' + r.vencimento_orig.slice(5,7) + '/' + r.vencimento_orig.slice(0,4)
        : ''
      const val  = Number(r.valor || 0).toFixed(2).replace('.', ',')
      const nota = notes[rawCnpj(r.cnpj)] || {}
      const vencPlan = nota.vencimento_planejado
        ? nota.vencimento_planejado.slice(8,10) + '/' + nota.vencimento_planejado.slice(5,7) + '/' + nota.vencimento_planejado.slice(0,4)
        : ''
      return `"${i+1}";"${r.nome || ''}";"${r.cnpj || ''}";"${r.banco || ''}";"${r.email || ''}";"${r.description || ''}";"${venc}";"${val}";"${r.dias ?? ''}";"${vencPlan}";"${nota.observacao || ''}"`
    }).join('\n')
    const blob = new Blob([bom + header + body], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `vencidos_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  return (
    <div className="gs-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-4">
        <h2 className="gs-section-title whitespace-nowrap flex-1">Lista de vencidos do mês</h2>
        <button
          onClick={downloadCsvVencidos}
          title="Baixar lista em CSV"
          className="gs-btn gs-btn-outline gs-btn-sm flex items-center gap-1.5"
        >
          <Download size={14} />
          <span className="hidden sm:inline">Exportar</span>
        </button>
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="gs-input text-sm w-48"
        />
      </div>

      <div className="overflow-x-auto">
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-center py-2 px-2 w-8">#</th>
                <th className={thSort('nome')} onClick={() => handleSort('nome')}>Cliente <SortIcon col="nome" /></th>
                <th className={thSort('valor', 'text-center')} onClick={() => handleSort('valor')}>Valor <SortIcon col="valor" /></th>
                <th className={thSort('vencimento_orig', 'text-center')} onClick={() => handleSort('vencimento_orig')}>1º Venc. <SortIcon col="vencimento_orig" /></th>
                <th className={thSort('dias', 'text-center')} onClick={() => handleSort('dias')}>Dias <SortIcon col="dias" /></th>
                <th className={thSort('banco', 'text-center')} onClick={() => handleSort('banco')}>Banco <SortIcon col="banco" /></th>
                <th className={thSort('email')} onClick={() => handleSort('email')}>Email <SortIcon col="email" /></th>
                <th className={thSort('description')} onClick={() => handleSort('description')}>Descrição Boleto <SortIcon col="description" /></th>
                <th className={thSort('vencimento_planejado', 'text-center')} onClick={() => handleSort('vencimento_planejado')}>Venc. Planejado <SortIcon col="vencimento_planejado" /></th>
                <th className={thSort('observacao')} onClick={() => handleSort('observacao')}>Observação <SortIcon col="observacao" /></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((r, i) => {
                const vencDate = r.vencimento_orig
                  ? r.vencimento_orig.slice(5, 10).split('-').reverse().join('/')
                  : '—'
                const diasColor = (r.dias ?? 0) > 15
                  ? 'text-red-600 font-bold'
                  : (r.dias ?? 0) > 7
                  ? 'text-orange-500 font-semibold'
                  : 'text-gray-600'
                return (
                  <tr key={i} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 px-2 text-center text-xs font-bold text-gray-400">{i + 1}</td>
                    <td className="py-2.5 px-4 max-w-[200px]">
                      <p className="font-semibold text-gray-800 truncate leading-tight">{r.nome}</p>
                      {r.cnpj && <p className="text-xs text-gray-400 font-mono">{r.cnpj}</p>}
                    </td>
                    <td className="py-2.5 px-4 text-center font-semibold text-red-600">{fmt(r.valor)}</td>
                    <td className="py-2.5 px-4 text-center text-gray-600">{vencDate}</td>
                    <td className={`py-2.5 px-4 text-center ${diasColor}`}>{r.dias != null ? `${r.dias}d` : '—'}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${BANCO_BADGE[r.banco] || 'bg-gray-100 text-gray-600'}`}>
                        {r.banco}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-gray-500 max-w-[180px] truncate">{r.email || '—'}</td>
                    <td className="py-2.5 px-4 text-xs text-gray-500 max-w-[200px] truncate">{r.description || '—'}</td>
                    <td className="py-2 px-3 text-center">
                      <input
                        type="date"
                        value={getNota(r.cnpj, 'vencimento_planejado')}
                        onChange={e => setNota(r.cnpj, 'vencimento_planejado', e.target.value)}
                        onBlur={() => saveNota(r.cnpj)}
                        className="text-xs border border-gray-200 rounded px-1.5 py-1 w-32 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={getNota(r.cnpj, 'observacao')}
                        onChange={e => setNota(r.cnpj, 'observacao', e.target.value)}
                        onBlur={() => saveNota(r.cnpj)}
                        placeholder="Observação..."
                        className="text-xs border border-gray-200 rounded px-2 py-1 w-full min-w-[140px] focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function ResumoBanco({ resumo, insight, month, year }) {
  const inputRef = useRef(null)
  const qc = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [itauCount, setItauCount] = useState(null)

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const token = localStorage.getItem('token')
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        `/api/analyst/itau/upload?month=${month}&year=${year}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Erro no upload')
      toast.success(`Itaú: ${data.inseridos} novos, ${data.atualizados} atualizados`)
      setItauCount(data.inseridos + data.atualizados)
      qc.invalidateQueries({ queryKey: ['analyst-operational'] })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const temItau = resumo.some(r => r.banco === 'Itaú')

  return (
    <div className="gs-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h2 className="gs-section-title">Resumo por banco</h2>
        <div className="flex items-center gap-2">
          {temItau && (
            <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 font-medium px-2.5 py-0.5 rounded-full border border-green-200">
              <CheckCircle size={10} />
              Itaú importado
            </span>
          )}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#3CB54A] border border-gray-200 hover:border-[#3CB54A] rounded-lg px-3 py-1.5 transition-colors"
          >
            <Upload size={13} />
            {uploading ? 'Enviando...' : 'Importar Itaú'}
          </button>
          <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
        </div>
      </div>
      {resumo.length === 0 ? (
        <div className="p-5 text-sm text-gray-400">
          Nenhum dado disponível. Importe a planilha do Itaú para visualizar.
        </div>
      ) : (
        <div className="p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-left py-2 px-3">Banco</th>
                <th className="text-right py-2 px-3">Faturado</th>
                <th className="text-right py-2 px-3">A vencer 30d</th>
                <th className="text-right py-2 px-3">Vencido</th>
                <th className="text-right py-2 px-3">Inadimp.</th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.banco === 'Itaú' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {r.banco}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-gray-800">{fmt(r.faturado ?? 0)}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{fmt(r.a_vencer_30d)}</td>
                  <td className={`py-3 px-3 text-right font-semibold ${r.vencido_ativo > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    {fmt(r.vencido_ativo)}
                  </td>
                  <td className={`py-3 px-3 text-right font-bold ${r.inadimplencia_pct > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {r.inadimplencia_pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {insight && (
            <div className="mt-4 border-l-4 border-[#3CB54A] pl-4 py-1">
              <p className="text-xs text-gray-600 leading-relaxed">
                {insight.split(/(\d+,?\d*% do risco[^.]+)/).map((part, i) =>
                  /^\d+,?\d*% do risco/.test(part)
                    ? <strong key={i} className="text-[#3CB54A]">{part}</strong>
                    : part
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function clientsForBucket(bucket, lista) {
  return (lista || []).filter(r => r.bucket === bucket)
}

const DIAS_FIXOS = [3, 10, 15, 20, 25]

const PLAN_BUCKETS = [
  { label: 'Dia 3',   min: 1,  max: 5  },
  { label: 'Dia 10',  min: 6,  max: 12 },
  { label: 'Dia 15',  min: 13, max: 17 },
  { label: 'Dia 20',  min: 18, max: 23 },
  { label: 'Dia 25',  min: 24, max: 27 },
  { label: 'Outros',  min: 28, max: 31  },
]

function PaymentPlanningChart({ planejadoPorDia, coberturaPct, clientesCom, clientesSem }) {
  const fmt2 = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const itens = PLAN_BUCKETS.map(b => {
    const rows = (planejadoPorDia || []).filter(d => {
      const dia = parseInt(d.dia, 10)
      return dia >= b.min && dia <= b.max
    })
    return {
      label:    b.label,
      previsto: rows.reduce((s, d) => s + (d.planejado || 0), 0),
      recebido: rows.reduce((s, d) => s + (d.realizado || 0), 0),
    }
  })

  const totalPrevisto = itens.reduce((s, i) => s + i.previsto, 0)
  const maxPrevisto   = Math.max(...itens.map(i => i.previsto))

  return (
    <div className="gs-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h2 className="gs-section-title">Planejamento comportamental</h2>
          <span className="text-[11px] bg-blue-50 text-blue-600 font-medium px-2 py-0.5 rounded-full border border-blue-100">Previsão</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">Baseado nos últimos 3 meses por CNPJ/CPF</p>
      </div>
      <div className="p-5 flex flex-col gap-3">
        {totalPrevisto === 0 ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-xs text-gray-400 text-center">
              Aguardando dados históricos de pagamento<br />para calcular o planejamento comportamental.
            </p>
          </div>
        ) : (
          <>
            {itens.map(({ label, previsto, recebido }) => {
              const pct    = totalPrevisto > 0 ? (previsto / totalPrevisto) * 100 : 0
              const recPct = previsto > 0 ? Math.min((recebido / previsto) * 100, 100) : 0
              const isMax  = previsto === maxPrevisto && previsto > 0
              return (
                <div key={label} className="flex items-center gap-3 text-sm">
                  <span className="w-16 text-gray-600 text-xs shrink-0">{label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                    <div
                      className="h-5 rounded-full"
                      style={{
                        width: `${Math.max(pct, 0.5)}%`,
                        backgroundColor: isMax ? '#EF4444' : '#3CB54A',
                      }}
                    />
                  </div>
                  <span className="w-14 text-right text-gray-500 text-xs shrink-0 font-medium">
                    {pct.toFixed(1)}%
                  </span>
                  <span className="w-28 text-right text-gray-700 text-xs shrink-0">
                    {fmt2(previsto)}
                  </span>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

function DistribuicaoDia({ calendario }) {
  const totalGeral = Object.values(calendario).reduce((s, v) => s + Number(v), 0)

  const grupos = DIAS_FIXOS.map(dia => ({
    label: `Dia ${dia}`,
    valor: Object.entries(calendario).reduce((s, [d, v]) => s + (Number(d) === dia ? Number(v) : 0), 0),
  }))
  const outrosValor = totalGeral - grupos.reduce((s, g) => s + g.valor, 0)
  const itens = [...grupos, { label: 'Outros', valor: outrosValor }]

  if (totalGeral === 0) return null

  const VERDE_GS = '#3CB54A'
  const VERMELHO_BAR = '#EF4444'

  return (
    <div className="gs-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <h2 className="gs-section-title">Distribuição do valor por dia de vencimento</h2>
      </div>
      <div className="p-5 flex flex-col gap-3">
        {itens.map(({ label, valor }) => {
          const pct = totalGeral > 0 ? (valor / totalGeral) * 100 : 0
          const isMax = valor === Math.max(...itens.map(i => i.valor))
          return (
            <div key={label} className="flex items-center gap-3 text-sm">
              <span className="w-16 text-gray-600 text-xs shrink-0">{label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                <div
                  className="h-5 rounded-full"
                  style={{ width: `${Math.max(pct, 0.5)}%`, backgroundColor: isMax ? VERMELHO_BAR : VERDE_GS }}
                />
              </div>
              <span className="w-14 text-right text-gray-500 text-xs shrink-0 font-medium">
                {pct.toFixed(1)}%
              </span>
              <span className="w-28 text-right text-gray-700 text-xs shrink-0">
                {`R$ ${Math.round(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalendarioVencimentos({ calendario, month, year }) {
  const hoje = new Date()
  const todayDay   = hoje.getDate()
  const todayMonth = hoje.getMonth() + 1
  const todayYear  = hoje.getFullYear()

  const firstDay  = new Date(year, month - 1, 1).getDay() // 0=Dom
  const daysInMonth = new Date(year, month, 0).getDate()

  // pico = dias com valor acima de 50% do máximo dia do mês
  const values = Object.values(calendario).map(Number)
  const maxVal = values.length ? Math.max(...values) : 0
  const PICO_THRESHOLD = maxVal * 0.5

  const monthLabel = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][month - 1]

  // monta grid: slots vazios + dias
  const slots = []
  for (let i = 0; i < firstDay; i++) slots.push(null)
  for (let d = 1; d <= daysInMonth; d++) slots.push(d)
  // preenche até completar semana
  while (slots.length % 7 !== 0) slots.push(null)

  const semanas = []
  for (let i = 0; i < slots.length; i += 7) semanas.push(slots.slice(i, i + 7))

  function cellStyle(day) {
    if (!day) return {}
    const val = calendario[String(day)] || 0
    const isHoje = day === todayDay && month === todayMonth && year === todayYear
    const isPico = val > 0 && val >= PICO_THRESHOLD
    if (isHoje) return { bg: 'bg-[#1a3a2a] text-white', num: 'text-white font-bold', val: 'text-green-300' }
    if (isPico) return { bg: 'bg-red-50 border border-red-200', num: 'text-red-600 font-bold', val: 'text-red-500' }
    if (val > 0) return { bg: 'bg-white border border-gray-200', num: 'text-gray-700 font-semibold', val: 'text-gray-500' }
    return { bg: 'bg-gray-50', num: 'text-gray-400', val: '' }
  }

  return (
    <div className="gs-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h2 className="gs-section-title">
          Calendário de vencimentos · <span className="font-normal text-gray-500">{monthLabel}/{String(year).slice(2)}</span>
        </h2>
        <span className="text-xs text-gray-400">Dias com maior volume marcados</span>
      </div>

      <div className="p-5">
        {/* Cabeçalho dias da semana */}
        <div className="grid grid-cols-7 mb-1">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
          ))}
        </div>

        {/* Semanas */}
        <div className="flex flex-col gap-1">
          {semanas.map((semana, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {semana.map((day, di) => {
                if (!day) return <div key={di} />
                const val = calendario[String(day)] || 0
                const s   = cellStyle(day)
                return (
                  <div key={di} className={`rounded-lg p-2 min-h-[56px] flex flex-col items-center justify-center gap-0.5 ${s.bg}`}>
                    <span className={`text-sm leading-none ${s.num}`}>{day}</span>
                    {val > 0 && (
                      <span className={`text-[10px] leading-none ${s.val}`}>
                        {fmt(val)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-5 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-red-100 border border-red-200" />
            Pico de vencimento
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-[#1a3a2a]" />
            Hoje
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-white border border-gray-200" />
            Com vencimento
          </span>
        </div>
      </div>
    </div>
  )
}

export default function AnalystDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const firstName = user?.name?.split(' ')[0] || 'Analista'

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear())

  const { data: op, isLoading } = useQuery({
    queryKey: ['analyst-operational', selectedMonth, selectedYear],
    queryFn: () => api.get(`/analyst/operational-summary?month=${selectedMonth}&year=${selectedYear}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const { data: agenda } = useQuery({
    queryKey: ['analyst-agenda'],
    queryFn: () => api.get('/analyst/weekly-agenda').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const { data: alerts } = useQuery({
    queryKey: ['analyst-alerts'],
    queryFn: () => api.get('/analyst/alerts').then(r => r.data),
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  })

  const { data: summary } = useQuery({
    queryKey: ['dashboard-summary', selectedMonth, selectedYear],
    queryFn: () => api.get(`/dashboard/summary?month=${selectedMonth}&year=${selectedYear}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
  const history = summary?.monthly_history || []

  const { data: plan } = useQuery({
    queryKey: ['payment-planning', selectedMonth, selectedYear],
    queryFn: () => api.get(`/analyst/payment-planning?month=${selectedMonth}&year=${selectedYear}`).then(r => r.data),
    staleTime: 10 * 60 * 1000,
  })

  const [agingBucket, setAgingBucket] = useState(null)
  const [reguaModal, setReguaModal]   = useState(false)

  const { data: reguaClientes, isLoading: reguaLoading } = useQuery({
    queryKey: ['regua-clientes', selectedMonth, selectedYear],
    queryFn: () => api.get(`/analyst/regua-clientes?month=${selectedMonth}&year=${selectedYear}`).then(r => r.data),
    enabled: reguaModal,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <Skeleton />

  if (op?.sem_dados) return (
    <div className="flex items-center justify-center h-48">
      <p className="text-gray-400 text-sm">Nenhum ciclo disponível ainda.</p>
    </div>
  )

  const comp = op?.comportamento || {}

  // WeekData com planejado comportamental (mantém realizado do op)
  const weekDataBehavioral = plan?.por_semana
    ? Object.fromEntries(
        Object.entries(op?.por_semana || {}).map(([k, v]) => [
          k, { ...v, planejado: plan.por_semana[k]?.planejado ?? v.planejado }
        ])
      )
    : op?.por_semana

  const availableYears = op?.available_cycles
    ? [...new Set(op.available_cycles.map(c => c.year))].sort((a, b) => b - a)
    : [now.getFullYear()]

  return (
    <div className="space-y-6">

      {/* Cabeçalho + filtro de mês */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="gs-page-title">Dashboard</h1>
        <div className="gs-card p-4 flex items-center gap-3">
          <span className="text-xs text-gray-500 font-medium">Período:</span>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {MONTHS_PT.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>


      {/* 6 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard label="Total emitido"
          value={fmt(op?.emitido)}
          sub={`${fmtN(op?.qtd_total)} cobranças`}
          icon={TrendingUp} iconColor="green" />
        <KPICard label="Total recebido"
          value={fmt(op?.recebido)}
          sub={`${op?.recebido_pct ?? 0}% do emitido`}
          valueColor="text-emerald-700"
          icon={CheckCircle} iconColor="green" />
        <KPICard label="Total vencido"
          value={fmt(op?.vencido)}
          sub={`${fmtN(op?.lista_vencidos?.length ?? op?.qtd_vencido)} clientes`}
          valueColor={(op?.vencido || 0) > 0 ? 'text-red-600' : 'text-gray-900'}
          icon={TrendingDown} iconColor={(op?.vencido || 0) > 0 ? 'red' : 'green'} />
        <KPICard label="Aguardando pgto."
          value={fmt(op?.confirmado)}
          sub={`${fmtN(op?.qtd_pendente ?? 0)} cobranças em aberto`}
          valueColor={(op?.confirmado || 0) > 0 ? 'text-amber-600' : 'text-gray-900'}
          icon={Clock} iconColor="yellow" />
        <KPICard label="Juros recebidos"
          value={fmt(op?.juros ?? 0)}
          sub="Itaú + Asaas · com acréscimo"
          valueColor={(op?.juros || 0) > 0 ? 'text-green-600' : 'text-gray-500'}
          icon={Percent} iconColor="green" />
      </div>

      {/* Planejado vs Realizado · comportamental */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WeeklyProgress weekData={weekDataBehavioral} />
        <DailyAccumulated data={plan?.acumulado ?? op?.acumulado_diario} month={selectedMonth} year={selectedYear} />
      </div>

      {/* Recebido diário */}
      <DailyReceived data={plan?.planejado_por_dia} />

      {/* Distribuição vencimento · Planejamento comportamental */}
      <div id="agenda-section" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DistribuicaoDia calendario={op?.calendario || {}} />
        <PaymentPlanningChart
          planejadoPorDia={plan?.planejado_por_dia}
          coberturaPct={plan?.cobertura_pct ?? 0}
          clientesCom={plan?.clientes_com_historico ?? 0}
          clientesSem={plan?.clientes_sem_historico ?? 0}
        />
      </div>

      {/* Resumo por banco · Taxa de conversão da régua */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ResumoBanco
          resumo={op?.resumo_banco || []}
          insight={op?.insight_banco}
          month={selectedMonth}
          year={selectedYear}
        />
        <div className="gs-card p-6 flex flex-col items-center justify-center text-center gap-2">
          <div className="flex items-center justify-between w-full">
            <h2 className="gs-section-title">Taxa de conversão da régua</h2>
            {(op?.taxa_conversao_regua?.total_overdue ?? 0) > 0 && (
              <button
                onClick={() => setReguaModal(true)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#3CB54A] border border-gray-200 hover:border-[#3CB54A] rounded-lg px-2.5 py-1 transition-colors"
              >
                <Users size={11} /> Ver clientes
              </button>
            )}
          </div>
          {(() => {
            const r = op?.taxa_conversao_regua || {}
            const pct = r.pct ?? 0
            const color = pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-500' : 'text-red-500'
            return (<>
              <p className={`text-5xl font-bold mt-2 ${color}`}>{pct}%</p>
              <p className="text-sm text-gray-600 font-medium">
                {(r.regularizados ?? 0).toLocaleString('pt-BR')} de {(r.total_overdue ?? 0).toLocaleString('pt-BR')} clientes pagaram
              </p>
              {(r.valor_total_overdue ?? 0) > 0 && (
                <p className="text-sm font-semibold text-amber-600">{fmt(r.valor_total_overdue)} em aberto em {r.mes_ref}</p>
              )}
              <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
                Clientes vencidos em <strong>{r.mes_ref || '—'}</strong> que regularizaram depois{' '}
                <span className="cursor-help" title="Clientes com boleto OVERDUE no mês de referência (M-1) que realizaram pelo menos um pagamento a partir daquele mês">ⓘ</span>
              </p>
            </>)
          })()}
        </div>
      </div>

      {/* Comportamento de pagamento + Aging — lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Comportamento de pagamento */}
        <div className="gs-card p-5 flex flex-col">
          <h2 className="gs-section-title mb-4">
            Comportamento de pagamento das cobranças recebidas
          </h2>
          <div className="flex gap-3 mb-5">
            {[
              { pct: comp.antes_pct, label: 'Antes' },
              { pct: comp.nodia_pct, label: 'No venc.' },
              { pct: comp.apos_pct,  label: 'Após' },
            ].map((c, i) => (
              <div key={i} className="gs-card px-4 py-3">
                <p className="gs-value">{c.pct ?? 0}%</p>
                <p className="gs-sub">{c.label}</p>
              </div>
            ))}
          </div>
          {[
            { label: 'Antes',    qtd: comp.antes_qtd, color: VERDE  },
            { label: 'No venc.', qtd: comp.nodia_qtd, color: AZUL   },
            { label: 'Após',     qtd: comp.apos_qtd,  color: AMBAR  },
          ].some(d => (d.qtd || 0) > 0) ? (
            <div className="flex-1 min-h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { label: 'Antes',    qtd: comp.antes_qtd || 0, fill: VERDE  },
                  { label: 'No venc.', qtd: comp.nodia_qtd || 0, fill: AZUL   },
                  { label: 'Após',     qtd: comp.apos_qtd  || 0, fill: AMBAR  },
                ]}
                layout="vertical"
                margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={65} />
                <Tooltip formatter={v => [v + ' cobranças']} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #EBEBEB' }} />
                <Bar dataKey="qtd" radius={[0, 4, 4, 0]}>
                  {[VERDE, AZUL, AMBAR].map((c, i) => <Cell key={i} fill={c} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState msg="Comportamento de pagamento aparece após registrar pagamentos manuais." />
          )}
        </div>

        {/* Aging de inadimplência */}
        <div id="aging-section" className="gs-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="gs-section-title">Aging List</h2>
          </div>

          <div className="p-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="text-center py-2 whitespace-nowrap">Bucket</th>
                  <th className="text-center py-2">Qtd</th>
                  <th className="text-center py-2 whitespace-nowrap">Valor em aberto</th>
                  <th className="text-center py-2 whitespace-nowrap">% vencido</th>
                  <th className="text-center py-2 whitespace-nowrap">Clientes</th>
                </tr>
              </thead>
              <tbody>
                {(op?.aging || []).map((row, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${BUCKET_COLOR[row.bucket] || 'bg-gray-100 text-gray-600'}`}>
                        {row.bucket}
                      </span>
                    </td>
                    <td className="py-2.5 text-center font-semibold text-gray-900">
                      {row.qtd > 0 ? row.qtd : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2.5 text-center text-gray-700 whitespace-nowrap">
                      {row.valor > 0 ? fmt(row.valor) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2.5 text-center text-gray-700">
                      {row.qtd > 0 ? `${row.pct}%` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2.5 text-center">
                      {row.qtd > 0 && (
                        <button
                          onClick={() => setAgingBucket(row)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                          <Users size={11} /> Ver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Lista de vencidos ordenada por valor */}
      {(op?.lista_vencidos || []).length > 0 && (
        <ListaVencidos rows={op.lista_vencidos} month={selectedMonth} year={selectedYear} />
      )}

      {/* Modal — clientes da régua */}
      {reguaModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setReguaModal(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800 text-sm">Clientes da régua</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Inadimplentes em {reguaClientes?.mes_ref || '—'} — status atual
                </p>
              </div>
              <button onClick={() => setReguaModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {reguaLoading ? (
                <div className="p-8 text-center text-sm text-gray-400">Carregando...</div>
              ) : !reguaClientes?.clientes?.length ? (
                <div className="p-8 text-center text-sm text-gray-400">Nenhum cliente encontrado.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white border-b border-gray-100">
                    <tr className="text-gray-400 uppercase tracking-wide">
                      <th className="text-left py-2.5 px-4">Cliente</th>
                      <th className="text-right py-2.5 px-4">Valor</th>
                      <th className="text-center py-2.5 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reguaClientes.clientes.map((c, i) => (
                      <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 px-4">
                          <p className="font-medium text-gray-800 truncate max-w-[220px]">{c.nome}</p>
                          {c.cnpj && <p className="text-gray-400 font-mono text-[10px]">{c.cnpj}</p>}
                        </td>
                        <td className="py-2.5 px-4 text-right text-gray-700 whitespace-nowrap">{fmt(c.valor_vencido)}</td>
                        <td className="py-2.5 px-4 text-center">
                          {c.pagou
                            ? <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Pagou</span>
                            : <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Pendente</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal central — clientes do bucket */}
      {agingBucket && (() => {
        const clients = clientsForBucket(agingBucket.bucket, op?.lista_vencidos)

        function downloadCsv() {
          const bom = '﻿'
          const header = 'Cliente;CNPJ;Banco;Vencimento;Valor\n'
          const rows = clients.map(r => {
            const venc = r.vencimento_orig
              ? r.vencimento_orig.slice(8,10) + '/' + r.vencimento_orig.slice(5,7) + '/' + r.vencimento_orig.slice(0,4)
              : ''
            const val = Number(r.valor || 0).toFixed(2).replace('.', ',')
            return `"${r.nome || ''}";"${r.cnpj || ''}";"${r.banco || ''}";"${venc}";"${val}"`
          }).join('\n')
          const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `aging_${agingBucket.bucket.replace(/[^a-z0-9]/gi, '_')}.csv`
          document.body.appendChild(a); a.click()
          document.body.removeChild(a); URL.revokeObjectURL(url)
        }

        return (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setAgingBucket(null) }}
          >
            <div className="bg-white w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl rounded-xl">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${BUCKET_COLOR[agingBucket.bucket] || 'bg-gray-100 text-gray-600'}`}>
                    {agingBucket.bucket}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {clients.length} clientes · {fmt(agingBucket.valor)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadCsv}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#3CB54A] border border-gray-200 hover:border-[#3CB54A] rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <Download size={13} />
                    Baixar Excel
                  </button>
                  <button
                    onClick={() => setAgingBucket(null)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              {/* Tabela */}
              <div className="overflow-y-auto flex-1">
                {clients.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">Nenhum cliente encontrado para este bucket.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white border-b border-gray-100">
                      <tr className="text-xs text-gray-400 uppercase tracking-wide">
                        <th className="text-left py-2.5 px-5">Cliente</th>
                        <th className="text-right py-2.5 px-4">Vencimento</th>
                        <th className="text-right py-2.5 px-4">Banco</th>
                        <th className="text-right py-2.5 px-5">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map((r, i) => (
                        <tr key={i} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-5">
                            <p className="font-medium text-gray-800 leading-tight">{r.nome || r.id_smart}</p>
                            {r.cnpj && <p className="text-xs text-gray-400 font-mono mt-0.5">{r.cnpj}</p>}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-500 whitespace-nowrap text-xs">
                            {r.vencimento_orig
                              ? r.vencimento_orig.slice(8,10) + '/' + r.vencimento_orig.slice(5,7) + '/' + r.vencimento_orig.slice(0,4)
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.banco === 'Itaú' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                              {r.banco || '—'}
                            </span>
                          </td>
                          <td className="py-3 px-5 text-right font-semibold text-red-600 whitespace-nowrap">
                            {fmt(r.valor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}

// ── Tabela de clientes compacta ───────────────────────────────
function ClientTableCompact({ title, clients, cycleId, accent, showDelay }) {
  const [openPayment, setOpenPayment] = useState(null)
  const [openDueDate, setOpenDueDate] = useState(null)
  const qc = useQueryClient()

  const handleClientPdf = async (cycleId, idSmart, filename) => {
    try {
      const r = await api.get(`/billing/cycles/${cycleId}/clients/${idSmart}/pdf`, { responseType: 'blob', timeout: 60000 })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url; a.download = filename || `Fatura_${idSmart}.pdf`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao gerar PDF') }
  }

  const accentH = { yellow: 'border-yellow-200 bg-yellow-50', red: 'border-red-200 bg-red-50' }

  return (
    <div className="gs-card overflow-hidden">
      <div className={`px-5 py-3 border-b ${accentH[accent]} flex items-center justify-between`}>
        <h2 className="gs-section-title">{title}</h2>
      </div>
      {clients.map(c => (
        <div key={c.id_smart} className="px-5 py-3.5 border-b border-gray-50 last:border-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{c.id_smart}</p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-gray-400">Venc: {fmtD(c.due_date)}</span>
                {showDelay && c.dias_atraso > 0 && (
                  <span className="text-xs font-medium text-red-600">{c.dias_atraso} dias em atraso</span>
                )}
                {c.boleto_url && (
                  <a href={c.boleto_url} target="_blank" rel="noreferrer"
                    className="text-xs text-green-600 flex items-center gap-0.5 hover:text-green-700">
                    Boleto <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
            <p className="text-sm font-bold text-gray-900 flex-shrink-0">{fmt(c.valor)}</p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <ActionBtn icon={<DollarSign size={14} />} label="Registrar pagamento" color="emerald"
                onClick={() => setOpenPayment({ id_smart: c.id_smart, valor: c.valor })} />
              <ActionBtn icon={<Edit2 size={14} />} label="Alterar vencimento" color="green"
                onClick={() => setOpenDueDate({ id_smart: c.id_smart })} />
              <ActionBtn icon={<FileText size={14} />} label="Gerar PDF"
                onClick={() => handleClientPdf(cycleId, c.id_smart)} />
            </div>
          </div>
        </div>
      ))}
      {openPayment && (
        <PaymentModal cycleId={cycleId} client={openPayment}
          onClose={() => setOpenPayment(null)}
          onSuccess={() => { setOpenPayment(null); qc.invalidateQueries({ queryKey: ['analyst-agenda'] }); qc.invalidateQueries({ queryKey: ['analyst-operational'] }) }} />
      )}
      {openDueDate && (
        <DueDateModal cycleId={cycleId} client={openDueDate}
          onClose={() => setOpenDueDate(null)}
          onSuccess={() => { setOpenDueDate(null); qc.invalidateQueries({ queryKey: ['analyst-agenda'] }); qc.invalidateQueries({ queryKey: ['analyst-operational'] }) }} />
      )}
    </div>
  )
}

// ── Modais ────────────────────────────────────────────────────
function PaymentModal({ cycleId, client, onClose, onSuccess }) {
  const [form, setForm] = useState({
    valor_recebido: client.valor?.toFixed(2) || '',
    data_pagamento: new Date().toISOString().slice(0,10),
    forma: 'PIX', observacao: '',
  })
  const [loading, setLoading] = useState(false)
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      await api.post('/analyst/payments', { cycle_id: +cycleId, id_smart: client.id_smart, ...form, valor_recebido: parseFloat(form.valor_recebido) })
      toast.success('Pagamento registrado!'); onSuccess()
    } catch { toast.error('Erro ao registrar') } finally { setLoading(false) }
  }
  return (
    <Modal title="Registrar Pagamento" sub={client.id_smart} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Valor recebido (R$)"><input type="number" step="0.01" value={form.valor_recebido} onChange={e => setForm(p => ({...p, valor_recebido: e.target.value}))} className={INPUT} required /></Field>
        <Field label="Data do pagamento"><input type="date" value={form.data_pagamento} onChange={e => setForm(p => ({...p, data_pagamento: e.target.value}))} className={INPUT} required /></Field>
        <Field label="Forma">
          <select value={form.forma} onChange={e => setForm(p => ({...p, forma: e.target.value}))} className={INPUT}>
            {['PIX','boleto','deposito','negociacao'].map(f => <option key={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Observação"><input value={form.observacao} onChange={e => setForm(p => ({...p, observacao: e.target.value}))} className={INPUT} placeholder="Opcional" /></Field>
        <ModalActions onClose={onClose} loading={loading} submitLabel="Registrar" />
      </form>
    </Modal>
  )
}

function DueDateModal({ cycleId, client, onClose, onSuccess }) {
  const [nova_data, setNovaData] = useState('')
  const [loading, setLoading] = useState(false)
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      await api.put('/analyst/due-date', { cycle_id: +cycleId, id_smart: client.id_smart, nova_data })
      toast.success('Vencimento atualizado!'); onSuccess()
    } catch { toast.error('Erro ao atualizar') } finally { setLoading(false) }
  }
  return (
    <Modal title="Alterar Vencimento" sub={client.id_smart} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nova data"><input type="date" value={nova_data} onChange={e => setNovaData(e.target.value)} className={INPUT} required /></Field>
        <ModalActions onClose={onClose} loading={loading} submitLabel="Atualizar" />
      </form>
    </Modal>
  )
}

// ── Componentes menores ───────────────────────────────────────
function KPICard({ label, value, sub, valueColor, large, icon: Icon, iconColor }) {
  const iconBg = {
    blue:  { background: '#F0FDF4', color: '#3CB54A' },
    green: { background: '#F0FDF4', color: '#16A34A' },
    red:   { background: '#FEF2F2', color: '#DC2626' },
    amber: { background: '#FFFBEB', color: '#D97706' },
  }[iconColor] || { background: '#F0FDF4', color: '#3CB54A' }

  return (
    <div className="gs-card p-4 flex items-center gap-3">
      {Icon && (
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={iconBg}>
          <Icon size={18} />
        </div>
      )}
      <div className="min-w-0">
        <p className="gs-label">{label}</p>
        <p className={`gs-value ${valueColor || ''}`} style={large ? { fontSize: 22 } : { fontSize: 18 }}>{value ?? '—'}</p>
        {sub && <p className="gs-sub">{sub}</p>}
      </div>
    </div>
  )
}

function AlertCard({ alert, onAction }) {
  const styles = { critical: 'bg-red-50 border-red-200 text-red-800', warning: 'bg-yellow-50 border-yellow-200 text-yellow-800', info: 'bg-green-50 border-green-200 text-green-800' }
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${styles[alert.level]}`}>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{alert.title}</span>
        {alert.value && <span className="text-sm font-bold">{alert.value}</span>}
      </div>
      {alert.action && (
        <button
          onClick={() => onAction?.(alert.action)}
          className="text-xs font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity"
        >
          {alert.action}
        </button>
      )}
    </div>
  )
}

function ActionBtn({ icon, label, color, onClick }) {
  const colors = { emerald: 'hover:bg-emerald-50 hover:text-emerald-700', green: 'hover:bg-green-50 hover:text-green-700', blue: 'hover:bg-green-50 hover:text-green-700' }
  return (
    <button title={label} onClick={onClick} className={`p-2 rounded-lg text-gray-400 transition-colors ${colors[color] || 'hover:bg-gray-100 hover:text-gray-700'}`}>
      {icon}
    </button>
  )
}

function EmptyState({ msg }) {
  return <div className="flex items-center justify-center py-10"><p className="text-xs text-gray-400 max-w-xs text-center leading-relaxed">{msg}</p></div>
}

function Modal({ title, sub, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <div><label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>{children}</div>
}

function ModalActions({ onClose, loading, submitLabel }) {
  return (
    <div className="flex gap-2 pt-2">
      <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">Cancelar</button>
      <button type="submit" disabled={loading} className="flex-1 gs-btn gs-btn-green justify-center">
        {loading ? 'Salvando...' : submitLabel}
      </button>
    </div>
  )
}



function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-64" />
      <div className="grid grid-cols-6 gap-3">{[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}</div>
      <div className="grid grid-cols-2 gap-4"><div className="h-64 bg-gray-200 rounded-xl" /><div className="h-64 bg-gray-200 rounded-xl" /></div>
      <div className="h-48 bg-gray-200 rounded-xl" />
      <div className="h-64 bg-gray-200 rounded-xl" />
    </div>
  )
}

const INPUT = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
