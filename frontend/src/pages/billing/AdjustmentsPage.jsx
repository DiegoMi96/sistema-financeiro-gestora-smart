import { useState, Fragment } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { billingApi } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { SlidersHorizontal, Plus, X, ChevronDown, ChevronUp, Lock, AlertTriangle } from 'lucide-react'

const fmt   = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const MONTHS_PT = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const now    = new Date()
const YEARS  = [now.getFullYear(), now.getFullYear() - 1]
const MONTHS = MONTHS_PT.slice(1).map((l, i) => ({ value: i + 1, label: l }))

const OFENSORES = [
  { value: 'Sistema',      label: 'Sistema',      color: 'gs-badge-red'    },
  { value: 'Proporcional', label: 'Proporcional', color: 'gs-badge-amber'  },
  { value: 'Financeiro',   label: 'Financeiro',   color: 'gs-badge-blue'   },
  { value: 'Logística',    label: 'Logística',    color: 'gs-badge-blue'   },
  { value: 'Comercial',    label: 'Comercial',    color: 'gs-badge-green'  },
  { value: 'Pacote',       label: 'Pacote',       color: 'gs-badge-gray'   },
  { value: 'Transferência',label: 'Transferência',color: 'gs-badge-gray'   },
  { value: 'Anuidade',     label: 'Anuidade',     color: 'gs-badge-gray'   },
  { value: 'Payments',     label: 'Payments',     color: 'gs-badge-blue'   },
]

const OFENSOR_COLOR = Object.fromEntries(OFENSORES.map(o => [o.value, o.color]))

const TYPE_LABELS = {
  desconto:  'Desconto',
  acrescimo: 'Acréscimo',
  isencao:   'Isenção',
  correcao:  'Correção',
}

const INPUT = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"

export default function AdjustmentsPage() {
  const { can } = useAuth()
  const qc      = useQueryClient()
  const [month, setMonth]     = useState('')
  const [year,  setYear]      = useState(now.getFullYear())
  const [ofensor, setOfensor] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [approving, setApproving] = useState(null)

  const handleApprove = async (a) => {
    setApproving(a.id)
    try {
      await billingApi.approveAdjustment(a.cycle_id, a.id, { approved: true })
      toast.success('Ajuste aprovado!')
      qc.invalidateQueries({ queryKey: ['all-adjustments'] })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao aprovar')
    } finally {
      setApproving(null)
    }
  }

  const { data: adjustments = [], isLoading } = useQuery({
    queryKey: ['all-adjustments', month, year, ofensor],
    queryFn: () => billingApi.allAdjustments({
      month:   month   || undefined,
      year:    year    || undefined,
      ofensor: ofensor || undefined,
    }).then(r => r.data),
    staleTime: 2 * 60 * 1000,
  })

  const totalDiff     = adjustments.reduce((s, a) => s + (a.valor_diferenca || 0), 0)
  const totalOriginal = adjustments.reduce((s, a) => s + (a.valor_original || 0), 0)
  const clientes      = new Set(adjustments.map(a => a.id_smart)).size

  // Agrupamento por ofensor para o painel de análise
  const byOfensor = adjustments.reduce((acc, a) => {
    const k = a.ofensor || 'Não informado'
    if (!acc[k]) acc[k] = { count: 0, valor: 0 }
    acc[k].count++
    acc[k].valor += a.valor_diferenca || 0
    return acc
  }, {})
  const ofensorList = Object.entries(byOfensor).sort((a, b) => a[1].valor - b[1].valor)

  const toggleRow = (id) => setExpanded(expanded === id ? null : id)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="gs-page-title">Ajustes de Clientes</h1>
          <p className="gs-page-sub">Descontos, isenções e correções aplicados por ciclo</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('can_edit_billing') && (
            <button onClick={() => setShowForm(true)}
              className="gs-btn gs-btn-dark flex items-center gap-2">
              <Plus size={14} /> Novo Ajuste
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="gs-card p-4 flex flex-wrap items-center gap-3">
        <SlidersHorizontal size={15} className="text-gray-400" />
        <select value={month} onChange={e => setMonth(e.target.value)} className="gs-select">
          <option value="">Todos os meses</option>
          {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select value={year} onChange={e => setYear(+e.target.value)} className="gs-select">
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={ofensor} onChange={e => setOfensor(e.target.value)} className="gs-select">
          <option value="">Todos os tipos</option>
          {OFENSORES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {(month || ofensor) && (
          <button onClick={() => { setMonth(''); setOfensor('') }}
            className="text-xs text-gray-400 hover:text-gray-700 underline">
            Limpar filtros
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total de ajustes',   val: adjustments.length,    cls: '' },
          { label: 'Clientes afetados',  val: clientes,              cls: '' },
          { label: 'Valor original',     val: fmt(totalOriginal),    cls: '' },
          { label: 'Impacto financeiro', val: fmt(totalDiff),        cls: totalDiff < 0 ? 'text-red-600' : 'text-green-600' },
        ].map(({ label, val, cls }) => (
          <div key={label} className="gs-card p-4">
            <p className="gs-label">{label}</p>
            <p className={`gs-value ${cls}`}>{val}</p>
          </div>
        ))}
      </div>

      {/* Análise por ofensor */}
      {ofensorList.length > 0 && (
        <div className="gs-card p-5">
          <h2 className="gs-section-title mb-4">Impacto por ofensor</h2>
          <div className="space-y-2">
            {ofensorList.map(([nome, d]) => {
              const pct = totalOriginal > 0 ? Math.abs(d.valor / totalOriginal * 100) : 0
              return (
                <div key={nome} className="flex items-center gap-3">
                  <div className="w-28 flex-shrink-0">
                    <span className={`gs-badge ${OFENSOR_COLOR[nome] || 'gs-badge-gray'} text-xs`}>{nome}</span>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-red-400 h-2 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="w-24 text-right text-xs text-gray-500">{d.count} aj.</div>
                  <div className="w-28 text-right text-sm font-semibold text-red-600">{fmt(d.valor)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="gs-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Carregando...</div>
        ) : adjustments.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <SlidersHorizontal size={24} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500 mb-1">Nenhum ajuste encontrado</p>
            <p className="text-xs text-gray-400 mb-5">Não há ajustes para o período e filtros selecionados.</p>
            {can('can_edit_billing') && (
              <button onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #3CB54A, #2EA040)' }}>
                <Plus size={14} /> Novo Ajuste
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="gs-th">Período</th>
                  <th className="gs-th">Cliente</th>
                  <th className="gs-th">Analista</th>
                  <th className="gs-th">Consultor</th>
                  <th className="gs-th">Ofensor</th>
                  <th className="gs-th">N.° Fatura</th>
                  <th className="gs-th-right">Valor Fatura</th>
                  <th className="gs-th-right">Valor Ajustado</th>
                  <th className="gs-th-right">Diferença</th>
                  <th className="gs-th">Status</th>
                  <th className="gs-th"></th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map(a => (
                  <Fragment key={a.id}>
                    <tr className="gs-tr border-t border-gray-100">
                      <td className="gs-td whitespace-nowrap text-xs text-gray-500">
                        {MONTHS_PT[a.cycle_month] ?? '—'}/{a.cycle_year}
                      </td>
                      <td className="gs-td">
                        <p className="font-medium text-gray-900 text-xs">{a.client_nome || a.id_smart}</p>
                        <p className="text-xs text-gray-400 font-mono">{a.id_smart}</p>
                      </td>
                      <td className="gs-td text-xs text-gray-600">{a.analista || '—'}</td>
                      <td className="gs-td text-xs text-gray-600 max-w-[120px] truncate">{a.consultor || '—'}</td>
                      <td className="gs-td">
                        {a.ofensor
                          ? <span className={`gs-badge ${OFENSOR_COLOR[a.ofensor] || 'gs-badge-gray'} text-xs`}>{a.ofensor}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="gs-td text-xs font-mono text-gray-500">{a.num_fatura || '—'}</td>
                      <td className="gs-td text-right text-xs text-gray-600">{fmt(a.valor_original)}</td>
                      <td className="gs-td text-right text-xs text-gray-600">{fmt(a.valor_ajustado)}</td>
                      <td className="gs-td text-right text-sm font-semibold">
                        <span className={a.valor_diferenca < 0 ? 'text-red-600' : 'text-green-600'}>
                          {a.valor_diferenca >= 0 ? '+' : ''}{fmt(a.valor_diferenca)}
                        </span>
                      </td>
                      <td className="gs-td">
                        {a.approved_at
                          ? <span className="gs-badge gs-badge-green text-xs">Aprovado</span>
                          : a.requires_approval
                            ? <span className="gs-badge gs-badge-amber text-xs">Pendente</span>
                            : <span className="gs-badge gs-badge-blue text-xs">Registrado</span>}
                      </td>
                      <td className="gs-td">
                        <button onClick={() => toggleRow(a.id)} className="text-gray-400 hover:text-gray-600">
                          {expanded === a.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>
                    </tr>
                    {expanded === a.id && (
                      <tr key={`exp-${a.id}`} className="bg-gray-50">
                        <td colSpan={11} className="px-6 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                            <div>
                              <p className="text-gray-400 mb-0.5">Motivo do ajuste</p>
                              <p className="text-gray-800">{a.justificativa}</p>
                            </div>
                            {a.observacao && (
                              <div>
                                <p className="text-gray-400 mb-0.5">Observação</p>
                                <p className="text-gray-800">{a.observacao}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-gray-400 mb-0.5">Data do ajuste</p>
                              <p className="text-gray-800">{a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR') : '—'}</p>
                            </div>
                            {a.approved_at && (
                              <div>
                                <p className="text-gray-400 mb-0.5">Aprovado em</p>
                                <p className="text-gray-800">{new Date(a.approved_at).toLocaleDateString('pt-BR')}</p>
                              </div>
                            )}
                          </div>
                          {/* Botão de aprovação para gestor/admin */}
                          {!a.approved_at && a.requires_approval && can('can_approve_adjustment') && (
                            <div className="mt-3 flex gap-2">
                              <button
                                onClick={() => handleApprove(a)}
                                disabled={approving === a.id}
                                className="px-4 py-1.5 text-xs font-semibold rounded-lg text-white"
                                style={{ background: '#3CB54A' }}
                              >
                                {approving === a.id ? 'Aprovando...' : 'Aprovar ajuste'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal novo ajuste */}
      {showForm && (
        <AdjustmentModal
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['all-adjustments'] })
          }}
        />
      )}
    </div>
  )
}

// ── Modal de novo ajuste ──────────────────────────────────────
// Props opcionais: defaultCycleId, defaultIdSmart, defaultNumFatura
// — quando fornecidos, os campos ficam bloqueados (contexto de cliente dentro de ciclo)
function AdjustmentModal({ onClose, onSuccess, defaultCycleId, defaultIdSmart, defaultNumFatura }) {
  const { user } = useAuth()
  const isAnalista = user?.role === 'contas_receber'

  const [form, setForm] = useState({
    cycle_id:        defaultCycleId  ? String(defaultCycleId) : '',
    id_smart:        defaultIdSmart  || '',
    type:            'desconto',
    component:       'total',
    valor_original:  '',
    valor_ajustado:  '',
    justificativa:   '',
    analista:        user?.name || '',
    consultor:       '',
    num_fatura:      defaultNumFatura || '',
    ofensor:         '',
    observacao:      '',
  })
  const [loading, setLoading] = useState(false)

  const { data: cycles = [] } = useQuery({
    queryKey: ['billing-cycles'],
    queryFn: () => billingApi.cycles().then(r => r.data),
    staleTime: 2 * 60 * 1000,
  })

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const diff = -parseFloat(form.valor_ajustado || 0)
  const needsApproval = Math.abs(diff) > 3000

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.cycle_id) return toast.error('Selecione o ciclo')
    setLoading(true)
    try {
      const valorEntrada = parseFloat(form.valor_ajustado)
      await billingApi.createAdjustment(+form.cycle_id, {
        ...form,
        valor_original: valorEntrada,
        valor_ajustado: 0,
      })
      toast.success('Ajuste registrado!')
      onSuccess()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar ajuste')
    } finally {
      setLoading(false)
    }
  }

  const LOCKED_INPUT = `${INPUT} bg-gray-50 text-gray-500 cursor-not-allowed`

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Novo Ajuste de Cliente</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Ciclo + ID Smart */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="gs-label mb-1 flex items-center gap-0.5">Ciclo <span className="text-red-500">*</span></label>
              {defaultCycleId ? (
                <div className="relative">
                  <select value={form.cycle_id} disabled className={LOCKED_INPUT}>
                    {cycles.map(c => (
                      <option key={c.id} value={c.id}>{String(c.month).padStart(2,'0')}/{c.year}</option>
                    ))}
                  </select>
                  <Lock size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              ) : (
                <select value={form.cycle_id} onChange={e => set('cycle_id', e.target.value)} required className={INPUT}>
                  <option value="">Selecionar...</option>
                  {cycles.map(c => (
                    <option key={c.id} value={c.id}>{String(c.month).padStart(2,'0')}/{c.year}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="gs-label mb-1 flex items-center gap-0.5 whitespace-nowrap">ID Smart (ss_CNPJ) <span className="text-red-500">*</span></label>
              <div className="relative">
                <input value={form.id_smart}
                  onChange={defaultIdSmart ? undefined : e => set('id_smart', e.target.value)}
                  readOnly={!!defaultIdSmart}
                  required
                  placeholder="ss_12345678000100"
                  className={defaultIdSmart ? LOCKED_INPUT : INPUT} />
                {defaultIdSmart && <Lock size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />}
              </div>
            </div>
          </div>

          {/* Componente */}
          <div>
            <label className="gs-label block mb-1">Componente <span className="text-red-500">*</span></label>
            <select value={form.component} onChange={e => set('component', e.target.value)} required className={INPUT}>
              {[
                { value: 'total',              label: 'Total' },
                { value: 'mensalidade',        label: 'Mensalidade' },
                { value: 'ativacao',           label: 'Ativação' },
                { value: 'excedente',          label: 'Excedente' },
                { value: 'multa',              label: 'Multa' },
                { value: 'multa_cancelamento', label: 'Multa de Cancelamento' },
                { value: 'sms',               label: 'SMS' },
                { value: 'frete',             label: 'Frete' },
                { value: 'mensageria',        label: 'Mensageria' },
                { value: 'pre_ativo',         label: 'Pré-ativo' },
                { value: 'ativo',             label: 'Ativo' },
                { value: 'cancelamento',      label: 'Cancelamento' },
                { value: 'suspenso',          label: 'Suspenso' },
              ].map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {/* Ofensor + Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="gs-label mb-1 flex items-center gap-0.5">Ofensor <span className="text-red-500">*</span></label>
              <select value={form.ofensor} onChange={e => set('ofensor', e.target.value)} required className={INPUT}>
                <option value="">Selecionar...</option>
                {OFENSORES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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

          {/* Analista + Consultor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="gs-label block mb-1 flex items-center gap-1">
                Analista {isAnalista && <Lock size={10} className="text-gray-400" />}
              </label>
              <input
                value={form.analista}
                onChange={isAnalista ? undefined : e => set('analista', e.target.value)}
                readOnly={isAnalista}
                placeholder="Nome do analista"
                className={isAnalista ? LOCKED_INPUT : INPUT}
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
            <div className="relative">
              <input value={form.num_fatura}
                onChange={defaultNumFatura ? undefined : e => set('num_fatura', e.target.value)}
                readOnly={!!defaultNumFatura}
                placeholder="825548749"
                className={defaultNumFatura ? LOCKED_INPUT : INPUT} />
              {defaultNumFatura && <Lock size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />}
            </div>
          </div>

          {/* Valores */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="gs-label mb-1 flex items-center gap-0.5 whitespace-nowrap">Valor da Fatura (R$) <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" value={form.valor_original}
                onChange={e => set('valor_original', e.target.value)} required
                placeholder="0,00" className={INPUT} />
            </div>
            <div>
              <label className="gs-label mb-1 flex items-center gap-0.5 whitespace-nowrap">
                Valor do Ajuste (R$) <span className="text-red-500">*</span>
              </label>
              <input type="number" step="0.01" value={form.valor_ajustado}
                onChange={e => set('valor_ajustado', e.target.value)} required
                placeholder="0,00" className={INPUT} />
              {form.valor_ajustado && (
                <p className="text-xs text-blue-600 mt-1">Será removido do total da fatura</p>
              )}
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

          {/* Aviso de aprovação necessária */}
          {needsApproval && form.valor_original && form.valor_ajustado && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Ajuste acima de R$&nbsp;3.000 — será enviado para aprovação do gestor antes de ser aplicado.</span>
            </div>
          )}

          {/* Motivo */}
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
            <button type="submit" disabled={loading} className="flex-1 gs-btn gs-btn-dark justify-center">
              {loading ? 'Salvando...' : 'Registrar Ajuste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
