import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { billingApi } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  Upload, Plus, CheckCircle, FileText,
  Trash2, Layers, ArrowRight, Loader2,
  DollarSign, Calendar, Clock
} from 'lucide-react'

const fmt   = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtN  = v => new Intl.NumberFormat('pt-BR').format(v || 0)
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const STATUS_CFG = {
  rascunho: { label: 'Processando',  color: '#D97706', bg: '#FFF8EB', step: 0 },
  revisao:  { label: 'Em Revisão',   color: '#D97706', bg: '#FFFBEB', step: 1 },
  aprovado: { label: 'Aprovado',     color: '#059669', bg: '#ECFDF5', step: 2 },
  fechado:  { label: 'Fechado',      color: '#374151', bg: '#F9FAFB', step: 3 },
}

export default function BillingPage() {
  const [showUpload, setShowUpload] = useState(false)
  const { can } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: cycles = [], isLoading } = useQuery({
    queryKey: ['billing-cycles'],
    queryFn: () => billingApi.cycles().then(r => r.data),
    staleTime: 2 * 60 * 1000,
    refetchInterval: (query) => query.state.data?.some(c => c.status === 'rascunho') ? 12000 : false,
  })

  const hasProcessing  = cycles.some(c => c.status === 'rascunho')
  const processingCycle = cycles.find(c => c.status === 'rascunho')

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!processingCycle?.created_at) { setElapsed(0); return }
    const tick = () => {
      const diff = Math.floor((Date.now() - new Date(processingCycle.created_at).getTime()) / 1000)
      setElapsed(Math.max(0, diff))
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [processingCycle?.created_at])

  const deleteMutation = useMutation({
    mutationFn: (id) => billingApi.deleteCycle(id),
    onSuccess: () => { toast.success('Ciclo excluído'); qc.invalidateQueries({ queryKey: ['billing-cycles'] }) },
    onError: (e) => toast.error(e.response?.data?.detail || 'Erro ao excluir'),
  })

  // KPIs derivados dos ciclos
  const totalCycles  = cycles.length
  const totalValue   = cycles.reduce((s, c) => s + (c.total_value || 0), 0)
  const pendingCount = cycles.filter(c => c.status === 'revisao').length

  // Breakdown do ciclo mais recente para o card de Total de Linhas
  const latestCycle = cycles[0]
  const { data: breakdownRaw = [] } = useQuery({
    queryKey: ['billing-breakdown-latest', latestCycle?.id],
    queryFn: () => billingApi.breakdown(latestCycle.id).then(r => r.data),
    enabled: !!latestCycle?.id,
    staleTime: 5 * 60 * 1000,
  })
  const bk = Object.fromEntries(breakdownRaw.map(r => [r.status, r.qtd]))
  const qtdAtivo    = bk['Ativo']    || 0
  const qtdPreAtivo = bk['Pré-ativo'] || 0
  const qtdSuspenso = bk['Suspenso'] || 0

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="gs-page-title">Faturamento</h1>
          <p className="gs-page-sub">Ciclos mensais · histórico e processamento</p>
        </div>
        {can('can_upload_files') && (
          <button onClick={() => setShowUpload(true)}
            className="gs-btn gs-btn-dark flex items-center gap-2">
            <Plus size={14} /> Novo Faturamento
          </button>
        )}
      </div>

      {/* ── KPIs ────────────────────────────────────────────── */}
      {cycles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Ciclos cadastrados', val: totalCycles,       cls: '',                                          Icon: Calendar,   iconColor: 'green' },
            { label: 'Volume acumulado',   val: fmt(totalValue),   cls: 'gs-value-green',                            Icon: DollarSign, iconColor: 'green' },
            { label: 'Total de linhas',    val: fmtN(latestCycle?.total_lines || 0), cls: '', Icon: Layers,     iconColor: 'amber', isLines: true },
            { label: 'Aguardando revisão', val: pendingCount,      cls: pendingCount > 0 ? 'gs-value-amber' : '',    Icon: Clock,      iconColor: pendingCount > 0 ? 'amber' : 'green' },
          ].map(({ label, val, cls, Icon, iconColor, isLines }) => {
            const iconBg = iconColor === 'amber'
              ? { background: '#FFFBEB', color: '#D97706' }
              : { background: '#F0FDF4', color: '#3CB54A' }
            return (
              <div key={label} className="gs-card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={iconBg}>
                  <Icon size={17} />
                </div>
                <div className="min-w-0">
                  <p className="gs-label">{label}</p>
                  <p className={`gs-value ${cls}`}>{val}</p>
                  {isLines && (qtdAtivo + qtdPreAtivo + qtdSuspenso > 0) && (
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                      <span className="text-xs text-gray-500"><span className="font-medium text-green-600">{fmtN(qtdAtivo)}</span> Ativo</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500"><span className="font-medium text-amber-500">{fmtN(qtdPreAtivo)}</span> Pré-ativo</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500"><span className="font-medium text-gray-500">{fmtN(qtdSuspenso)}</span> Suspenso</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Banner processando ───────────────────────────────── */}
      {hasProcessing && (
        <div className="gs-card p-4 flex items-center gap-4 border-l-4" style={{ borderLeftColor: '#3CB54A' }}>
          <Loader2 size={18} className="text-green-600 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-green-900 text-sm">Processando base de dados...</p>
            <p className="text-green-700 text-xs mt-0.5">
              Bases grandes (~746k linhas) levam de 10 a 20 minutos.
              {' '}Tempo: <span className="font-mono font-medium">{Math.floor(elapsed / 60)}m {elapsed % 60}s</span>
              {' '}— atualiza automaticamente.
            </p>
          </div>
        </div>
      )}

      {/* ── Tabela de ciclos ─────────────────────────────────── */}
      {isLoading ? (
        <div className="gs-card p-8 text-center text-gray-400 text-sm">
          <Loader2 size={18} className="animate-spin inline mr-2" /> Carregando ciclos...
        </div>
      ) : cycles.length === 0 ? (
        <EmptyState onNew={() => setShowUpload(true)} canUpload={can('can_upload_files')} />
      ) : (
        <div className="gs-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="gs-th w-1/5">Período</th>
                  <th className="gs-th w-1/5">Status</th>
                  <th className="gs-th w-1/5">Linhas</th>
                  <th className="gs-th w-1/5">Boletos</th>
                  <th className="gs-th w-1/5">Total faturado</th>
                  <th className="gs-th" style={{width:'48px'}}></th>
                </tr>
              </thead>
              <tbody>
                {cycles.map(c => {
                  const cfg = STATUS_CFG[c.status] || STATUS_CFG.revisao
                  return (
                    <tr key={c.id} className="group gs-tr border-t border-gray-100 cursor-pointer"
                      onClick={() => navigate(`/faturamento/${c.id}`)}>
                      <td className="gs-td text-center font-medium text-gray-900">
                        {MONTHS_PT[c.month - 1]} {c.year}
                      </td>
                      <td className="gs-td text-center">
                        <span className="gs-badge text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: cfg.bg, color: cfg.color }}>
                          {c.status === 'rascunho' ? (
                            <span className="flex items-center gap-1">
                              <Loader2 size={9} className="animate-spin" /> {cfg.label}
                            </span>
                          ) : cfg.label}
                        </span>
                      </td>
                      <td className="gs-td text-center text-xs text-gray-600">
                        {c.status !== 'rascunho' ? (
                          <span className="flex items-center justify-center gap-1">
                            <Layers size={11} className="text-gray-400" /> {fmtN(c.total_lines)}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="gs-td text-center text-xs text-gray-600">
                        {c.status !== 'rascunho' ? (
                          <span className="flex items-center justify-center gap-1">
                            <FileText size={11} className="text-gray-400" /> {fmtN(c.total_boletos)}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="gs-td text-center font-semibold text-gray-900">
                        {c.status !== 'rascunho' ? fmt(c.total_value) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="gs-td">
                        <div className="flex items-center justify-end gap-1">
                          {can('can_upload_files') && (
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                if (confirm(`Excluir o ciclo ${MONTHS_PT[c.month - 1]} ${c.year}?`)) {
                                  deleteMutation.mutate(c.id)
                                }
                              }}
                              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                              <Trash2 size={14} />
                            </button>
                          )}
                          <ArrowRight size={14} className="text-gray-300 group-hover:text-green-500 transition-colors" />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Upload Modal ─────────────────────────────────────── */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => { setShowUpload(false); qc.invalidateQueries({ queryKey: ['billing-cycles'] }) }}
        />
      )}
    </div>
  )
}

// ── Upload Modal ──────────────────────────────────────────────
function UploadModal({ onClose, onSuccess }) {
  const [year, setYear]   = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [files, setFiles] = useState({})
  const [loading, setLoading] = useState(false)

  const required    = ['base', 'cancelamentos', 'vencimentos', 'reajuste', 'sms', 'mensageria']
  const allRequired = required.every(k => files[k])

  const handleFile = (key, file) => setFiles(prev => ({ ...prev, [key]: file }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!allRequired) return toast.error('Preencha todos os arquivos obrigatórios')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('base_file',          files.base)
      fd.append('cancelamentos_file', files.cancelamentos)
      if (files.fretes) fd.append('fretes_file', files.fretes)
      fd.append('vencimentos_file',   files.vencimentos)
      fd.append('reajuste_file',      files.reajuste)
      fd.append('sms_file',           files.sms)
      fd.append('mensageria_file',    files.mensageria)
      if (files.atencao) fd.append('atencao_file', files.atencao)
      await billingApi.processBilling(year, month, fd)
      toast.success('Processamento iniciado!')
      onSuccess()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao processar')
    } finally {
      setLoading(false)
    }
  }

  const FILE_FIELDS = [
    { key: 'base',          label: 'Base Crua',                  req: true,  hint: 'base_smart_DD-MM.xlsx' },
    { key: 'cancelamentos', label: 'Cancelamentos',              req: true,  hint: 'CancelamentosSmartt_YYYY.xlsx' },
    { key: 'fretes',        label: 'Fretes',                     req: false, hint: 'FRETES_SMART_MMMYY.xlsx' },
    { key: 'vencimentos',   label: 'Vencimentos',                req: true,  hint: '01_-_VENCIMENTOS.xlsx' },
    { key: 'reajuste',      label: 'Base de Reajuste',           req: true,  hint: 'Base_Reajuste.xlsx' },
    { key: 'sms',           label: 'SMS',                        req: true,  hint: 'SMS_MM_YYYY.xlsx' },
    { key: 'mensageria',    label: 'Mensageria',                 req: true,  hint: 'Pacote_Mensageria.xlsx' },
    { key: 'atencao',       label: 'Atenção Clientes',           req: false, hint: 'Atencao_com_esses_clientes.xlsx' },
  ]

  const doneCount = required.filter(k => files[k]).length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">

        {/* Header do modal */}
        <div className="px-6 pt-6 pb-5 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: '#F0FDF4' }}>
              <Upload size={16} style={{ color: '#3CB54A' }} />
            </div>
            <h2 className="text-base font-bold text-gray-900">Novo Ciclo de Faturamento</h2>
          </div>
          <p className="text-xs text-gray-400 ml-12">Selecione o período e os arquivos de entrada</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Período */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Período de referência</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Mês</label>
                <select value={month} onChange={e => setMonth(+e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none bg-white">
                  {MONTHS_PT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Ano</label>
                <input type="number" value={year} onChange={e => setYear(+e.target.value)}
                  min={2024} max={2030}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" />
              </div>
            </div>
          </div>

          {/* Arquivos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Arquivos</p>
              <span className="text-xs text-gray-400">{doneCount}/{required.length} obrigatórios</span>
            </div>

            {/* Barra de progresso */}
            <div className="h-1 bg-gray-100 rounded-full mb-3 overflow-hidden">
              <div
                className="h-1 rounded-full transition-all duration-300"
                style={{
                  width: `${(doneCount / required.length) * 100}%`,
                  background: doneCount === required.length ? '#059669' : '#3CB54A',
                }}
              />
            </div>

            <div className="space-y-2">
              {FILE_FIELDS.map(({ key, label, req, hint }) => {
                const done = !!files[key]
                return (
                  <label key={key} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-all ${
                    done
                      ? 'border-emerald-200 bg-emerald-50/60'
                      : 'border-gray-200 hover:border-green-300 hover:bg-green-50/30'
                  }`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      done ? 'bg-emerald-500' : 'bg-gray-100'
                    }`}>
                      {done
                        ? <CheckCircle size={14} className="text-white" />
                        : <Upload size={13} className="text-gray-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${done ? 'text-emerald-700' : 'text-gray-700'}`}>
                        {label} {req && <span className="text-red-400">*</span>}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {done ? files[key].name : hint}
                      </p>
                    </div>
                    <input type="file" accept=".xlsx,.xls" className="hidden"
                      onChange={e => handleFile(key, e.target.files[0])} />
                  </label>
                )
              })}
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading || !allRequired}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: allRequired ? 'linear-gradient(135deg, #3CB54A, #2EA040)' : '#E5E7EB', color: allRequired ? '#fff' : '#9CA3AF' }}>
              {loading ? (
                <><Loader2 size={14} className="animate-spin" /> Processando...</>
              ) : (
                <><ArrowRight size={14} /> Iniciar processamento</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────
function EmptyState({ onNew, canUpload }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-14 text-center"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <FileText size={28} className="text-gray-300" />
      </div>
      <h3 className="font-semibold text-gray-700 mb-1">Nenhum ciclo cadastrado</h3>
      <p className="text-gray-400 text-sm mb-5">
        Faça o upload dos arquivos para processar o primeiro ciclo de faturamento
      </p>
      {canUpload && (
        <button onClick={onNew}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #3CB54A, #2EA040)' }}>
          <Plus size={15} /> Criar primeiro ciclo
        </button>
      )}
    </div>
  )
}
