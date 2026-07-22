import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { billingApi } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { ArrowLeft, Download, Plus, ChevronLeft, ChevronRight, DollarSign, Zap, TrendingUp, AlertCircle, MessageSquare, Truck, Bell, Wallet, Lock, X, Loader2, Trash2 } from 'lucide-react'

const OFENSORES = [
  'Sistema','Proporcional','Financeiro','Logística','Comercial','Pacote','Transferência','Anuidade','Payments'
]

const fmt  = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtN = v => new Intl.NumberFormat('pt-BR').format(v || 0)

const LINES_PER_PAGE = 200

export default function ClientDetailPage() {
  const { cycleId, idSmart } = useParams()
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const { can }  = useAuth()
  const [showAdjForm, setShowAdjForm] = useState(false)
  const [linePage, setLinePage] = useState(1)
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [excelLoading, setExcelLoading] = useState(false)

  const id = decodeURIComponent(idSmart)

  const { data: linesData, isLoading: linesLoading } = useQuery({
    queryKey: ['client-lines', cycleId, id, linePage],
    queryFn: () => billingApi.clientLines(+cycleId, id, { page: linePage, per_page: LINES_PER_PAGE }).then(r => r.data),
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000,
  })

  // Busca o summary do cliente (totais financeiros — vem rápido, não espera linhas)
  const { data: summaryData } = useQuery({
    queryKey: ['client-summary', cycleId, id],
    queryFn: () => billingApi.clientSummary(+cycleId, id).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const lines       = linesData?.items ?? linesData ?? []
  const linesTotal  = linesData?.total ?? lines.length
  const totalPages  = Math.ceil(linesTotal / LINES_PER_PAGE)

  const { data: cycle } = useQuery({
    queryKey: ['cycle', cycleId],
    queryFn: () => billingApi.cycle(+cycleId).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

const { data: adjustments = [] } = useQuery({
    queryKey: ['cycle-adjustments', cycleId],
    queryFn: () => billingApi.adjustments(+cycleId).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const deleteAdjMutation = useMutation({
    mutationFn: (adjId) => billingApi.deleteAdjustment(+cycleId, adjId),
    onSuccess: () => {
      toast.success('Ajuste removido')
      qc.invalidateQueries({ queryKey: ['cycle-adjustments', cycleId] })
      qc.invalidateQueries({ queryKey: ['client-summary', cycleId, id] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Erro ao remover ajuste'),
  })

  const clientAdjs = adjustments.filter(a => a.id_smart === id)

  // Totais do summary (chegam rápido, sem esperar carregar todas as linhas)
  const totals = {
    mensalidade:  summaryData?.total_mensalidade  || 0,
    ativacao:     summaryData?.total_ativacao     || 0,
    excedente:    summaryData?.total_excedente    || 0,
    multa:        summaryData?.total_multa        || 0,
    sms:          summaryData?.total_sms          || 0,
    frete:        summaryData?.total_frete        || 0,
    mensageria:   summaryData?.total_mensageria   || 0,
    cancelamento: summaryData?.total_cancelamento || 0,
    total:        summaryData?.total_final        || 0,
  }

  const totalFinal = totals.total

  const handleExportPdf = async () => {
    if (pdfLoading) return
    setPdfLoading(true)
    try {
      const r = await billingApi.exportPdf(+cycleId, id)
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }))
      const a   = document.createElement('a')
      a.href    = url
      a.download = `Fatura_${id}_${cycle?.month?.toString().padStart(2,'0')}${cycle?.year}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao gerar PDF') }
    finally { setPdfLoading(false) }
  }

  const handleExportExcel = async () => {
    if (excelLoading) return
    setExcelLoading(true)
    try {
      const r = await billingApi.exportClientExcel(+cycleId, id)
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a   = document.createElement('a')
      a.href    = url
      a.download = `Detalhamento_${id}_${cycle?.month?.toString().padStart(2,'0')}${cycle?.year}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao gerar Excel') }
    finally { setExcelLoading(false) }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <button onClick={() => navigate(`/faturamento/${cycleId}`)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="gs-page-title">{summaryData?.client_nome || id}</h1>
          <p className="text-gray-500 text-sm">{cycle ? `${cycle.month}/${cycle.year}` : cycleId} · {linesLoading ? '…' : fmtN(linesTotal)} linhas</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('can_create_adjustment') && (
            <button onClick={() => setShowAdjForm(true)} className="gs-btn gs-btn-outline gs-btn-sm">
              <Plus size={14} />
              Ajuste
            </button>
          )}
          <button onClick={handleExportExcel} disabled={excelLoading} className="gs-btn gs-btn-outline gs-btn-sm">
            {excelLoading ? <><Loader2 size={14} className="animate-spin" /> Gerando...</> : <><Download size={14} /> Faturamento Cliente</>}
          </button>
          <button onClick={handleExportPdf} disabled={pdfLoading} className="gs-btn gs-btn-outline gs-btn-sm">
            {pdfLoading ? <><Loader2 size={14} className="animate-spin" /> Gerando PDF...</> : <><Download size={14} /> PDF</>}
          </button>
        </div>
      </div>

      {/* Resumo financeiro */}
      {(() => {
        const ICON_BG = {
          blue:  { background: '#F0FDF4', color: '#3CB54A' },
          green: { background: '#F0FDF4', color: '#16A34A' },
          amber: { background: '#FFFBEB', color: '#D97706' },
          red:   { background: '#FEF2F2', color: '#DC2626' },
        }
        const cards = [
          { label: 'Mensalidade',  val: totals.mensalidade,  Icon: DollarSign,    ic: 'green' },
          { label: 'Ativação',     val: totals.ativacao,     Icon: Zap,           ic: 'amber' },
          { label: 'Excedente',    val: totals.excedente,    Icon: TrendingUp,    ic: 'red'   },
          { label: 'Cancelamento', val: totals.cancelamento, Icon: AlertCircle,   ic: 'red'   },
          { label: 'Multa',        val: totals.multa,        Icon: AlertCircle,   ic: 'red'   },
          { label: 'SMS',          val: totals.sms,          Icon: MessageSquare, ic: 'green' },
          { label: 'Frete',        val: totals.frete,        Icon: Truck,         ic: 'amber' },
          { label: 'Mensageria',   val: totals.mensageria,   Icon: Bell,          ic: 'green' },
          { label: 'Total Final',  val: totalFinal,          Icon: Wallet,        ic: 'green', isTotal: true },
        ]
        return (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-5 gap-3">
              {cards.slice(0, 5).map(({ label, val, Icon, ic, isTotal }) => (
                <div key={label} className="gs-card p-4 flex items-center gap-3"
                  style={isTotal ? { borderColor: '#3CB54A', borderWidth: 1.5 } : {}}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={ICON_BG[ic]}>
                    <Icon size={15} />
                  </div>
                  <div>
                    <p className="gs-label">{label}</p>
                    <p className={`gs-value ${isTotal ? 'gs-value-green' : ''}`} style={{ fontSize: 14 }}>{fmt(val)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {cards.slice(5).map(({ label, val, Icon, ic, isTotal }) => (
                <div key={label} className="gs-card p-4 flex items-center gap-3"
                  style={isTotal ? { borderColor: '#3CB54A', borderWidth: 1.5 } : {}}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={ICON_BG[ic]}>
                    <Icon size={15} />
                  </div>
                  <div>
                    <p className="gs-label">{label}</p>
                    <p className={`gs-value ${isTotal ? 'gs-value-green' : ''}`} style={{ fontSize: 14 }}>{fmt(val)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Ajustes aplicados */}
      {clientAdjs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-3">Ajustes na fatura ({clientAdjs.length})</h3>
          <div className="space-y-2">
            {clientAdjs.map(a => (
              <div key={a.id} className="flex items-center justify-between text-sm gap-3">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-amber-900 capitalize">{a.type}</span>
                  {a.component && a.component !== 'total' && (
                    <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{a.component}</span>
                  )}
                  {a.ofensor && <span className="ml-1.5 text-xs text-amber-500">[{a.ofensor}]</span>}
                  <span className="text-amber-700 ml-2 truncate">— {a.justificativa}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`font-semibold ${a.valor_diferenca < 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {a.valor_diferenca >= 0 ? '+' : ''}{fmt(a.valor_diferenca)}
                  </span>
                  {can('can_create_adjustment') && (
                    <button
                      onClick={() => { if (window.confirm('Remover este ajuste?')) deleteAdjMutation.mutate(a.id) }}
                      disabled={deleteAdjMutation.isPending}
                      className="text-red-400 hover:text-red-600 disabled:opacity-50"
                      title="Excluir ajuste">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

{/* Linhas detalhadas */}
      <div className="gs-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <h2 className="gs-section-title">
            Linhas detalhadas
            {linesLoading
              ? <span className="ml-2 text-gray-400 font-normal text-xs">carregando...</span>
              : <span className="ml-2 text-gray-400 font-normal text-xs">{fmtN(linesTotal)} linhas</span>
            }
          </h2>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Pág {linePage}/{totalPages}</span>
              <button disabled={linePage===1} onClick={() => setLinePage(p=>p-1)}
                className="p-1 border rounded hover:bg-gray-50 disabled:opacity-40">
                <ChevronLeft size={13} />
              </button>
              <button disabled={linePage===totalPages} onClick={() => setLinePage(p=>p+1)}
                className="p-1 border rounded hover:bg-gray-50 disabled:opacity-40">
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>

        {linesLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            <div className="inline-block w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin mb-2" />
            <p>Carregando linhas...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {(() => {
              const LINE_COLS = [
                { key: 'iccid',               label: 'ICCID' },
                { key: 'msisdn',              label: 'MSISDN' },
                { key: 'operadora',           label: 'Operadora' },
                { key: 'status',              label: 'Status' },
                { key: 'dias',                label: 'Dias' },
                { key: 'mensalidade_cobrada', label: 'Mensalidade' },
                { key: 'ativacao_cobrada',    label: 'Ativação' },
                { key: 'excedente_cobrado',   label: 'Excedente' },
                { key: 'multa_cobrada',       label: 'Multa' },
                { key: 'sms_cobrado',         label: 'SMS' },
                { key: 'total_linha',         label: 'Total' },
              ]
              const handleSort = (key) => {
                if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
                else { setSortCol(key); setSortDir('asc') }
              }
              const sorted = [...lines].sort((a, b) => {
                if (!sortCol) return 0
                const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0
                if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
                return sortDir === 'asc' ? av - bv : bv - av
              })
              return (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {LINE_COLS.map(({ key, label }) => (
                    <th key={key} className="gs-th cursor-pointer select-none hover:text-gray-600"
                      onClick={() => handleSort(key)}>
                      <span className="inline-flex items-center justify-center gap-1">
                        {label}
                        <span className="text-gray-400">{sortCol === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(l => (
                  <tr key={l.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-center text-gray-700 font-mono text-xs">{l.iccid}</td>
                    <td className="px-4 py-2.5 text-center text-gray-600 text-xs">{l.msisdn}</td>
                    <td className="px-4 py-2.5 text-center text-gray-600 text-xs">{l.operadora}</td>
                    <td className="px-4 py-2.5 text-center"><StatusChip status={l.status} /></td>
                    <td className="px-4 py-2.5 text-center text-gray-700">{l.dias}</td>
                    <td className="px-4 py-2.5 text-center text-gray-700">{fmt(l.mensalidade_cobrada)}</td>
                    <td className="px-4 py-2.5 text-center text-gray-700">{fmt(l.ativacao_cobrada)}</td>
                    <td className="px-4 py-2.5 text-center text-gray-700">{fmt(l.excedente_cobrado)}</td>
                    <td className="px-4 py-2.5 text-center text-gray-700">{fmt(l.multa_cobrada)}</td>
                    <td className="px-4 py-2.5 text-center text-gray-700">{fmt(l.sms_cobrado)}</td>
                    <td className="px-4 py-2.5 text-center font-semibold text-gray-900">{fmt(l.total_linha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            )})()}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <span>Mostrando {(linePage-1)*LINES_PER_PAGE+1}–{Math.min(linePage*LINES_PER_PAGE, linesTotal)} de {fmtN(linesTotal)}</span>
                <div className="flex gap-2">
                  <button disabled={linePage===1} onClick={() => setLinePage(p=>p-1)}
                    className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">← Anterior</button>
                  <button disabled={linePage===totalPages} onClick={() => setLinePage(p=>p+1)}
                    className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Próximo →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de ajuste */}
      {showAdjForm && (
        <AdjustmentModal
          cycleId={cycleId} idSmart={id} totals={totals}
          onClose={() => setShowAdjForm(false)}
          onSuccess={() => { setShowAdjForm(false); qc.invalidateQueries({ queryKey: ['cycle-adjustments', cycleId] }) }}
        />
      )}
    </div>
  )
}

function AdjustmentModal({ cycleId, idSmart, totals, onClose, onSuccess }) {
  const { user } = useAuth()
  const isAnalista = user?.role === 'contas_receber'

  const INPUT = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
  const LOCKED = `${INPUT} bg-gray-50 text-gray-500 cursor-not-allowed`

  const parseBRL = (str) => {
    if (!str && str !== 0) return 0
    const s = str.toString().replace(/\./g, '').replace(',', '.')
    return parseFloat(s) || 0
  }
  const fmtBRL = (num) => {
    const n = typeof num === 'string' ? parseBRL(num) : (num || 0)
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  }
  const handleBRLBlur = (key, val) => {
    const n = parseBRL(val)
    if (!isNaN(n)) set(key, fmtBRL(n))
  }

  const [form, setForm] = useState({
    type: 'desconto',
    component: 'total',
    ofensor: '',
    valor_original: totals?.total ? fmtBRL(totals.total) : '',
    valor_ajustado: '',
    analista: user?.name || '',
    consultor: '',
    num_fatura: '',
    justificativa: '',
    observacao: '',
  })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const diff = parseBRL(form.valor_ajustado) - parseBRL(form.valor_original)
  const needsApproval = Math.abs(diff) > 3000

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.justificativa.trim()) return toast.error('Justificativa obrigatória')
    setLoading(true)
    try {
      await billingApi.createAdjustment(+cycleId, {
        ...form,
        id_smart: idSmart,
        valor_original: parseBRL(form.valor_original),
        valor_ajustado: parseBRL(form.valor_ajustado),
      })
      toast.success('Ajuste criado!')
      onSuccess()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao criar ajuste')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Novo Ajuste de Fatura</h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{idSmart}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Ofensor + Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="gs-label mb-1 flex items-center gap-0.5">Ofensor</label>
              <select value={form.ofensor} onChange={e => set('ofensor', e.target.value)} className={INPUT}>
                <option value="">Selecionar...</option>
                {OFENSORES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="gs-label block mb-1">Tipo</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className={INPUT}>
                <option value="desconto">Desconto</option>
                <option value="isencao">Isenção</option>
                <option value="correcao">Correção</option>
                <option value="acrescimo">Acréscimo</option>
              </select>
            </div>
          </div>

          {/* Componente */}
          <div>
            <label className="gs-label block mb-1">Componente <span className="text-red-500">*</span></label>
            <select value={form.component} onChange={e => {
              const comp = e.target.value
              const compToTotal = {
                mensalidade: totals?.mensalidade, ativacao: totals?.ativacao,
                excedente: totals?.excedente, multa: totals?.multa,
                sms: totals?.sms, frete: totals?.frete, mensageria: totals?.mensageria,
                total: totals?.total,
              }
              set('component', comp)
              if (compToTotal[comp] != null) set('valor_original', fmtBRL(compToTotal[comp]))
            }} required className={INPUT}>
              {['total','mensalidade','ativacao','excedente','multa','sms','frete','mensageria'].map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Analista + Consultor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="gs-label mb-1 flex items-center gap-1">
                Analista {isAnalista && <Lock size={10} className="text-gray-400" />}
              </label>
              <input
                value={form.analista}
                onChange={isAnalista ? undefined : e => set('analista', e.target.value)}
                readOnly={isAnalista}
                placeholder="Nome do analista"
                className={isAnalista ? LOCKED : INPUT}
              />
            </div>
            <div>
              <label className="gs-label block mb-1">Consultor / Parceiro</label>
              <input value={form.consultor} onChange={e => set('consultor', e.target.value)}
                placeholder="Nome do consultor" className={INPUT} />
            </div>
          </div>

          {/* N.° Fatura */}
          <div>
            <label className="gs-label block mb-1">N.° da Fatura</label>
            <input value={form.num_fatura} onChange={e => set('num_fatura', e.target.value)}
              placeholder="825548749" className={INPUT} />
          </div>

          {/* Valores */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="gs-label mb-1 flex items-center gap-0.5 whitespace-nowrap">Valor Fatura (R$) <span className="text-red-500">*</span></label>
              <input type="text" inputMode="decimal" value={form.valor_original}
                onChange={e => set('valor_original', e.target.value)}
                onBlur={e => handleBRLBlur('valor_original', e.target.value)}
                required placeholder="0,00" className={INPUT} />
            </div>
            <div>
              <label className="gs-label mb-1 flex items-center gap-0.5 whitespace-nowrap">Valor Ajustado (R$) <span className="text-red-500">*</span></label>
              <input type="text" inputMode="decimal" value={form.valor_ajustado}
                onChange={e => set('valor_ajustado', e.target.value)}
                onBlur={e => handleBRLBlur('valor_ajustado', e.target.value)}
                required placeholder="0,00" className={INPUT} />
            </div>
            <div>
              <label className="gs-label block mb-1">Diferença</label>
              <div className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                diff < 0 ? 'border-red-200 bg-red-50 text-red-700' :
                diff > 0 ? 'border-green-200 bg-green-50 text-green-700' :
                'border-gray-200 bg-gray-50 text-gray-400'
              }`}>
                {form.valor_original && form.valor_ajustado
                  ? `${diff >= 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(diff)}`
                  : '—'}
              </div>
            </div>
          </div>

          {/* Aviso aprovação */}
          {needsApproval && form.valor_original && form.valor_ajustado && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Ajuste acima de R$&nbsp;3.000 — será enviado para aprovação do gestor antes de ser aplicado.</span>
            </div>
          )}

          {/* Justificativa */}
          <div>
            <label className="gs-label mb-1 flex items-center gap-0.5">Motivo do ajuste <span className="text-red-500">*</span></label>
            <textarea rows={3} value={form.justificativa} onChange={e => set('justificativa', e.target.value)}
              required placeholder="Descreva o motivo detalhado do ajuste..."
              className={`${INPUT} resize-none`} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: loading ? '#9ca3af' : '#3CB54A' }}>
              {loading ? 'Salvando...' : 'Registrar Ajuste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StatusChip({ status }) {
  const map = { Ativo:'bg-green-100 text-green-700', 'Pré-ativo':'bg-gray-100 text-gray-600', Suspenso:'bg-yellow-100 text-yellow-700', Cancelamento:'bg-red-100 text-red-700', Frete:'bg-blue-100 text-blue-700', 'Pacote Mensageria':'bg-teal-100 text-teal-700' }
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>
}

