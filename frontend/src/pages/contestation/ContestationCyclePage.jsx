import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Download, CheckCircle, Send, DollarSign,
  Search, Filter, Eye, X, Check, AlertTriangle, Info
} from 'lucide-react'

const fmt  = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const MESES = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const TYPE_CONFIG = {
  valor_acima_contrato:    { label: 'Valor acima do contrato',    color: 'red',    icon: '💰' },
  pcte_adicional_indevido: { label: 'Pacote adicional indevido',  color: 'orange', icon: '📦' },
  linha_nao_identificada:  { label: 'Linha não identificada',     color: 'red',    icon: '❓' },
  transferencia:           { label: 'Transferência (verificar)',  color: 'blue',   icon: '🔄' },
  cs:                      { label: 'CS — Informativo',           color: 'gray',   icon: 'ℹ️' },
}

const STATUS_STYLES = {
  detectado: 'bg-gray-100 text-gray-600',
  contestar: 'bg-emerald-100 text-emerald-700',
  ignorar:   'bg-yellow-100 text-yellow-700',
  enviado:   'bg-blue-100 text-blue-700',
  aceito:    'bg-emerald-100 text-emerald-700',
  rejeitado: 'bg-red-100 text-red-700',
}

export default function ContestationCyclePage() {
  const { cycleId } = useParams()
  const navigate    = useNavigate()
  const qc          = useQueryClient()

  const [tab, setTab]         = useState('valor_acima_contrato')
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const [showCredit, setShowCredit] = useState(false)
  const [selected, setSelected]   = useState([])

  const { data: cycle } = useQuery({
    queryKey: ['cont-cycle', cycleId],
    queryFn:  () => api.get(`/contestation/cycles/${cycleId}`).then(r => r.data),
  })

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['cont-items', cycleId, tab, page],
    queryFn:  () => api.get(`/contestation/cycles/${cycleId}/items`, {
      params: { type: tab === 'all' ? undefined : tab, page, per_page: 100 }
    }).then(r => r.data),
    keepPreviousData: true,
  })

  const { data: credits = [] } = useQuery({
    queryKey: ['cont-credits', cycleId],
    queryFn:  () => api.get(`/contestation/cycles/${cycleId}/credits`).then(r => r.data),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ itemId, status, obs }) =>
      api.put(`/contestation/cycles/${cycleId}/items/${itemId}/review`, { status, observacao_manual: obs }),
    onSuccess: () => qc.invalidateQueries(['cont-items', cycleId]),
  })

  const bulkMutation = useMutation({
    mutationFn: ({ ids, status }) =>
      api.put(`/contestation/cycles/${cycleId}/items/bulk-review`, { item_ids: ids, status }),
    onSuccess: () => { setSelected([]); qc.invalidateQueries(['cont-items', cycleId]); qc.invalidateQueries(['cont-cycle', cycleId]) },
    onError: () => toast.error('Erro ao atualizar itens'),
  })

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/contestation/cycles/${cycleId}/approve`),
    onSuccess: () => { toast.success('Ciclo aprovado!'); qc.invalidateQueries(['cont-cycle', cycleId]) },
  })

  const sentMutation = useMutation({
    mutationFn: () => api.post(`/contestation/cycles/${cycleId}/mark-sent`),
    onSuccess: () => { toast.success('Marcado como enviado!'); qc.invalidateQueries(['cont-cycle', cycleId]) },
  })

  const handleExport = async () => {
    try {
      const r = await api.get(`/contestation/cycles/${cycleId}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a')
      a.href = url; a.download = `Contestacao_${cycle?.month?.toString().padStart(2,'0')}_${cycle?.year}.xlsx`
      a.click(); URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao exportar') }
  }

  const summary = itemsData?.summary || {}
  const items   = itemsData?.items || []
  const total   = itemsData?.total || 0

  const tabs = Object.entries(TYPE_CONFIG).map(([key, cfg]) => ({
    key, ...cfg,
    count: summary[key]?.total || 0,
    valor: summary[key]?.valor || 0,
  }))

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const selectAll = () => setSelected(items.map(i => i.id))
  const clearSelect = () => setSelected([])

  if (!cycle) return <div className="text-gray-400 text-sm">Carregando...</div>

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/contestacao')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">
            Contestação — {MESES[cycle.month]} {cycle.year}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {cycle.total_itens_detectados} detectados · {cycle.total_itens_contestar} selecionados para contestar
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
            <Download size={14} />Excel
          </button>
          <button onClick={() => setShowCredit(true)}
            className="flex items-center gap-2 px-3 py-2 border border-emerald-300 text-emerald-700 rounded-lg text-sm hover:bg-emerald-50">
            <DollarSign size={14} />Registrar crédito
          </button>
          {cycle.status === 'revisao' && (
            <button onClick={() => approveMutation.mutate()}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <CheckCircle size={14} />Aprovar
            </button>
          )}
          {cycle.status === 'aprovado' && (
            <button onClick={() => sentMutation.mutate()}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Send size={14} />Marcar como enviado
            </button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-red-200 p-4">
          <p className="text-xs text-gray-400">Total a Contestar</p>
          <p className="text-xl font-bold text-red-600 mt-1">{fmt(cycle.valor_total_contestado)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400">Itens Detectados</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{cycle.total_itens_detectados}</p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-200 p-4">
          <p className="text-xs text-gray-400">Crédito Recebido</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{fmt(cycle.valor_total_credito)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400">CS — Informativo</p>
          <p className="text-xl font-bold text-gray-600 mt-1">{fmt(cycle.valor_cs)}</p>
        </div>
      </div>

      {/* Créditos recebidos */}
      {credits.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-emerald-800 mb-2">✅ Créditos recebidos</p>
          <div className="space-y-1">
            {credits.map(cr => (
              <div key={cr.id} className="flex justify-between text-sm">
                <span className="text-emerald-700">Ref. {cr.ref_month?.toString().padStart(2,'0')}/{cr.ref_year}</span>
                <span className="font-bold text-emerald-800">{fmt(cr.valor_recebido)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs por tipo */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b border-gray-100">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setPage(1); setSelected([]) }}
              className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}>
              <span className="mr-1">{t.icon}</span>
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  t.color === 'red' ? 'bg-red-100 text-red-700' :
                  t.color === 'orange' ? 'bg-orange-100 text-orange-700' :
                  t.color === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Bulk actions */}
        {selected.length > 0 && (
          <div className="px-5 py-2.5 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
            <span className="text-sm font-medium text-orange-700">{selected.length} itens selecionados</span>
            <div className="flex gap-2">
              <button onClick={() => bulkMutation.mutate({ ids: selected, status: 'contestar' })}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700">
                <Check size={12} />Contestar todos
              </button>
              <button onClick={() => bulkMutation.mutate({ ids: selected, status: 'ignorar' })}
                className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600">
                <X size={12} />Ignorar todos
              </button>
              <button onClick={clearSelect} className="text-xs text-gray-500 hover:text-gray-700">Limpar</button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar MSISDN, pacote..."
              className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="text-xs text-gray-400 hover:text-gray-700">Selecionar todos</button>
            {total > 0 && <span className="text-xs text-gray-400">{total} itens</span>}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 w-8"><input type="checkbox" onChange={e => e.target.checked ? selectAll() : clearSelect()} checked={selected.length === items.length && items.length > 0} /></th>
                <th className="px-4 py-2.5 text-left">MSISDN</th>
                <th className="px-4 py-2.5 text-left">Operadora</th>
                <th className="px-4 py-2.5 text-left">Pacote</th>
                <th className="px-4 py-2.5 text-right">Custo</th>
                <th className="px-4 py-2.5 text-right">Faturado</th>
                <th className="px-4 py-2.5 text-right">Diferença</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-gray-400">Carregando...</td></tr>
              ) : items.filter(i => !search || i.msisdn?.includes(search) || i.pacote_forn?.toLowerCase().includes(search.toLowerCase())).map(item => (
                <tr key={item.id} className={`border-b border-gray-50 hover:bg-gray-50 ${selected.includes(item.id) ? 'bg-orange-50' : ''}`}>
                  <td className="px-4 py-3 w-8">
                    <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelect(item.id)} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.msisdn || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{item.operadora || item.operadora_forn || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate" title={item.pacote_forn}>{item.pacote_forn || item.nome_pedido || '—'}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-600">{fmt(item.valor_esperado || item.valor_contrato)}</td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-gray-800">{fmt(item.valor_faturado)}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-red-600">{fmt(item.valor_diferenca)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[item.status] || 'bg-gray-100 text-gray-600'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button title="Contestar" onClick={() => reviewMutation.mutate({ itemId: item.id, status: 'contestar' })}
                        className="p-1.5 hover:bg-emerald-50 rounded-lg text-gray-400 hover:text-emerald-600">
                        <Check size={13} />
                      </button>
                      <button title="Ignorar" onClick={() => reviewMutation.mutate({ itemId: item.id, status: 'ignorar' })}
                        className="p-1.5 hover:bg-yellow-50 rounded-lg text-gray-400 hover:text-yellow-600">
                        <X size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {total > 100 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Mostrando {(page-1)*100+1}–{Math.min(page*100, total)} de {total}</span>
            <div className="flex gap-2">
              <button disabled={page===1} onClick={() => setPage(p => p-1)} className="px-3 py-1 border rounded disabled:opacity-40">← Ant.</button>
              <button disabled={page*100>=total} onClick={() => setPage(p => p+1)} className="px-3 py-1 border rounded disabled:opacity-40">Próx. →</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal crédito */}
      {showCredit && (
        <CreditModal cycleId={cycleId} cycle={cycle}
          onClose={() => setShowCredit(false)}
          onSuccess={() => { setShowCredit(false); qc.invalidateQueries(['cont-credits', cycleId]); qc.invalidateQueries(['cont-cycle', cycleId]) }}
        />
      )}
    </div>
  )
}

// ── Modal Crédito ──────────────────────────────────────────────

function CreditModal({ cycleId, cycle, onClose, onSuccess }) {
  const [form, setForm] = useState({
    ref_year:         cycle?.year || new Date().getFullYear(),
    ref_month:        cycle?.month || new Date().getMonth() + 1,
    valor_contestado: cycle?.valor_total_contestado?.toFixed(2) || '',
    valor_recebido:   '',
    data_recebimento: new Date().toISOString().slice(0,10),
    observacao:       '',
  })
  const [loading, setLoading] = useState(false)
  const set = (k,v) => setForm(p => ({...p, [k]: v}))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post(`/contestation/cycles/${cycleId}/credits`, {
        ...form,
        valor_contestado: parseFloat(form.valor_contestado),
        valor_recebido:   parseFloat(form.valor_recebido),
      })
      toast.success('Crédito registrado!')
      onSuccess()
    } catch { toast.error('Erro ao registrar') } finally { setLoading(false) }
  }

  const INPUT = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
  const MESES_PT = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Registrar Crédito Recebido</h2>
          <p className="text-xs text-gray-400 mt-0.5">Desconto recebido do fornecedor na próxima fatura</p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mês ref.</label>
              <select value={form.ref_month} onChange={e => set('ref_month', +e.target.value)} className={INPUT}>
                {MESES_PT.slice(1).map((m,i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ano ref.</label>
              <input type="number" value={form.ref_year} onChange={e => set('ref_year', +e.target.value)} className={INPUT} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Valor contestado (R$)</label>
            <input type="number" step="0.01" value={form.valor_contestado} onChange={e => set('valor_contestado', e.target.value)} className={INPUT} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Valor recebido (R$)</label>
            <input type="number" step="0.01" value={form.valor_recebido} onChange={e => set('valor_recebido', e.target.value)} className={INPUT} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Data do crédito na fatura</label>
            <input type="date" value={form.data_recebimento} onChange={e => set('data_recebimento', e.target.value)} className={INPUT} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Observação</label>
            <input value={form.observacao} onChange={e => set('observacao', e.target.value)} className={INPUT} placeholder="Ex: desconto aplicado na fatura de julho" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium">Cancelar</button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {loading ? 'Salvando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
