import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Search, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

const MONTHS_PT = [
  { value: 1,  label: 'Janeiro'   }, { value: 2,  label: 'Fevereiro' },
  { value: 3,  label: 'Março'     }, { value: 4,  label: 'Abril'     },
  { value: 5,  label: 'Maio'      }, { value: 6,  label: 'Junho'     },
  { value: 7,  label: 'Julho'     }, { value: 8,  label: 'Agosto'    },
  { value: 9,  label: 'Setembro'  }, { value: 10, label: 'Outubro'   },
  { value: 11, label: 'Novembro'  }, { value: 12, label: 'Dezembro'  },
]

const now = new Date()
const THIS_YEAR = now.getFullYear()
const YEARS = [THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2]

const SCORE_STYLE = {
  A: { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500'  },
  B: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-400' },
  C: { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500'    },
}

function ScoreBadge({ score }) {
  if (!score || !SCORE_STYLE[score]) return <span className="text-gray-400 text-xs">—</span>
  const s = SCORE_STYLE[score]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${s.bg} ${s.text} ${s.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {score}
    </span>
  )
}

function DiasBadge({ avg }) {
  if (avg == null) return <span className="text-gray-400 text-xs">—</span>
  if (avg > 1)  return <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium"><TrendingDown size={12} />{avg}d antes</span>
  if (avg >= 0) return <span className="inline-flex items-center gap-1 text-gray-500 text-xs"><Minus size={12} />No prazo</span>
  return <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium"><TrendingUp size={12} />{Math.abs(avg)}d atraso</span>
}

function fmt(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val ?? 0)
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="gs-card p-4 flex flex-col gap-1">
      <span className="gs-label">{label}</span>
      <span className={`gs-value ${color || ''}`}>{value}</span>
      {sub && <span className="gs-sub">{sub}</span>}
    </div>
  )
}

function PendingRow({ p }) {
  return (
    <tr className="gs-tr border-t border-gray-50">
      <td className="gs-td pl-10 font-mono text-xs text-gray-600">{p.id_smart || <span className="text-gray-300">—</span>}</td>
      <td className="gs-td text-xs text-gray-500 max-w-[180px] truncate">{p.nome || p.customer_id}</td>
      <td className="gs-td text-right">{fmt(p.valor)}</td>
      <td className="gs-td text-center">{fmtDate(p.vencimento)}</td>
      <td className="gs-td text-center font-medium">{fmtDate(p.data_prevista)}</td>
      <td className="gs-td text-center"><ScoreBadge score={p.score} /></td>
      <td className="gs-td text-xs text-gray-400">{p.observacao}</td>
    </tr>
  )
}

function ScoreRow({ s, expanded, onToggle, pendingMap }) {
  const myPending = pendingMap[s.customer_id] || []
  const hasPending = myPending.length > 0
  return (
    <>
      <tr
        className={`gs-tr border-t border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${expanded ? 'bg-green-50/40' : ''}`}
        onClick={onToggle}
      >
        <td className="gs-td w-6">
          {hasPending
            ? (expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />)
            : <span className="inline-block w-4" />
          }
        </td>
        <td className="gs-td text-xs text-gray-500 max-w-[200px] truncate" title={s.nome}>{s.nome || s.customer_id}</td>
        <td className="gs-td font-mono text-xs text-gray-500">{s.cnpj || <span className="text-gray-300">—</span>}</td>
        <td className="gs-td text-center"><ScoreBadge score={s.score} /></td>
        <td className="gs-td text-center"><DiasBadge avg={s.avg_dias} /></td>
        <td className="gs-td text-center text-xs text-gray-600">{s.qtd_pagamentos}</td>
        <td className="gs-td text-center text-xs text-gray-500">{s.std_dias}d</td>
        <td className="gs-td text-xs text-gray-500">{s.previsao_padrao}</td>
        <td className="gs-td text-center text-xs">
          {hasPending
            ? <span className="inline-flex items-center gap-1 text-orange-600 font-medium"><AlertTriangle size={11} />{myPending.length}</span>
            : <span className="text-gray-300">—</span>
          }
        </td>
        <td className="gs-td text-right text-xs text-gray-600">
          {hasPending ? fmt(myPending.reduce((a, p) => a + p.valor, 0)) : '—'}
        </td>
      </tr>
      {expanded && hasPending && myPending.map((p, i) => <PendingRow key={i} p={p} />)}
    </>
  )
}

export default function PrevisibilidadePage() {
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear,  setSelectedYear]  = useState(THIS_YEAR)
  const [filterScore,   setFilterScore]   = useState('Todos')
  const [filterPending, setFilterPending] = useState(false)
  const [search,        setSearch]        = useState('')
  const [expanded,      setExpanded]      = useState({})
  const [downloading,   setDownloading]   = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['previsibilidade-summary', selectedMonth, selectedYear],
    queryFn: () => api.get(`/previsibilidade/summary?month=${selectedMonth}&year=${selectedYear}`).then(r => r.data),
    staleTime: 10 * 60 * 1000,
  })

  const kpis    = data?.kpis    || {}
  const scores  = data?.scores  || []
  const pending = data?.pending || []

  // mapa customer_id → lista de pendentes (evita filtrar O(n) em cada linha)
  const pendingMap = useMemo(() => {
    const map = {}
    for (const p of pending) {
      const cid = p.customer_id || ''
      if (!map[cid]) map[cid] = []
      map[cid].push(p)
    }
    return map
  }, [pending])

  const filtered = useMemo(() => {
    let list = scores
    if (filterScore !== 'Todos') list = list.filter(s => s.score === filterScore)
    if (filterPending) list = list.filter(s => !!pendingMap[s.customer_id])
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(s =>
        (s.nome     || '').toLowerCase().includes(q) ||
        (s.cnpj     || '').toLowerCase().includes(q) ||
        (s.customer_id || '').toLowerCase().includes(q)
      )
    }
    // clientes com pendências sempre primeiro
    list = [...list].sort((a, b) => {
      const ap = pendingMap[a.customer_id] ? 0 : 1
      const bp = pendingMap[b.customer_id] ? 0 : 1
      return ap - bp
    })
    return list
  }, [scores, filterScore, filterPending, search, pendingMap])

  function toggle(cid) {
    setExpanded(prev => ({ ...prev, [cid]: !prev[cid] }))
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      const response = await api.get(
        `/previsibilidade/export?month=${selectedMonth}&year=${selectedYear}`,
        { responseType: 'blob' }
      )
      const url  = URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href      = url
      link.download  = `previsibilidade_comportamental_${String(selectedMonth).padStart(2,'0')}_${selectedYear}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success('Planilha gerada com sucesso!')
    } catch {
      toast.error('Erro ao gerar a planilha. Tente novamente.')
    } finally {
      setDownloading(false)
    }
  }

  const monthLabel = MONTHS_PT.find(m => m.value === selectedMonth)?.label

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="gs-page-title">Previsibilidade Comportamental</h1>
          <p className="gs-page-sub">Score de pagamento por cliente com previsão de recebimento — {monthLabel} {selectedYear}</p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading || isLoading}
          className="gs-btn gs-btn-dark flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Download size={15} />
          {downloading ? 'Gerando...' : 'Exportar Excel'}
        </button>
      </div>

      {/* Filtros de período */}
      <div className="gs-card p-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Mês</label>
          <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="gs-select">
            {MONTHS_PT.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Ano</label>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="gs-select">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <p className="text-xs text-gray-400 self-end pb-1">Score calculado com base nos últimos 6 meses de pagamentos do Asaas.</p>
      </div>

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="gs-card p-4 animate-pulse h-20 bg-gray-100 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="gs-card p-6 text-center text-red-500 text-sm">Erro ao carregar dados. Verifique a conexão com o Asaas.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard label="Clientes analisados" value={kpis.total_clientes ?? 0} />
          <KpiCard label="Score A – Baixo risco"  value={`${kpis.pct_score_a ?? 0}%`}  color="text-green-600"  sub="Pagam no prazo / antes" />
          <KpiCard label="Score B – Médio risco"  value={`${kpis.pct_score_b ?? 0}%`}  color="text-orange-500" sub="Até 5 dias de atraso" />
          <KpiCard label="Score C – Alto risco"   value={`${kpis.pct_score_c ?? 0}%`}  color="text-red-600"    sub="Mais de 5 dias de atraso" />
          <KpiCard label="Cobranças em aberto" value={kpis.total_pending ?? 0} />
          <KpiCard label="Valor em aberto" value={fmt(kpis.valor_pending)} color="text-gray-700" />
        </div>
      )}

      {/* Tabela de scores */}
      {!isLoading && !isError && (
        <div className="gs-card overflow-hidden">
          {/* Barra de filtro da tabela */}
          <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por id_smart, nome..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="gs-input pl-8 w-full text-sm"
              />
            </div>
            <div className="flex items-center gap-1">
              {['Todos', 'A', 'B', 'C'].map(sc => (
                <button
                  key={sc}
                  onClick={() => setFilterScore(sc)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    filterScore === sc
                      ? sc === 'A' ? 'bg-green-600 text-white border-green-600'
                        : sc === 'B' ? 'bg-orange-500 text-white border-orange-500'
                        : sc === 'C' ? 'bg-red-600 text-white border-red-600'
                        : 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {sc === 'Todos' ? 'Todos' : `Score ${sc}`}
                </button>
              ))}
            </div>
            <button
              onClick={() => setFilterPending(p => !p)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                filterPending
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Com pendências {pending.length > 0 && `(${pending.length})`}
            </button>
            <span className="text-xs text-gray-400">{filtered.length} cliente{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '560px' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 sticky top-0 z-10">
                  <th className="gs-th w-6" />
                  <th className="gs-th text-left">Nome / Cliente</th>
                  <th className="gs-th text-left">CNPJ</th>
                  <th className="gs-th text-center">Score</th>
                  <th className="gs-th text-center">Comportamento</th>
                  <th className="gs-th text-center">Pagamentos</th>
                  <th className="gs-th text-center">Desvio</th>
                  <th className="gs-th text-left">Padrão</th>
                  <th className="gs-th text-center">Em aberto</th>
                  <th className="gs-th text-right">Valor aberto</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-sm text-gray-400">Nenhum cliente encontrado.</td>
                  </tr>
                ) : filtered.map(s => (
                  <ScoreRow
                    key={s.customer_id}
                    s={s}
                    pendingMap={pendingMap}
                    expanded={!!expanded[s.customer_id]}
                    onToggle={() => toggle(s.customer_id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div className="p-4 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" />Score A — paga antes ou no vencimento</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-400" />Score B — atrasa até 5 dias em média</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500"    />Score C — atrasa mais de 5 dias</span>
            <span className="text-gray-400 ml-auto">Clique em uma linha para ver as cobranças abertas do cliente</span>
          </div>
        </div>
      )}
    </div>
  )
}
