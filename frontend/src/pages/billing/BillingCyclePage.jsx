import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { billingApi } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { ArrowLeft, Download, CheckCircle, Search, ChevronRight, FileText, FileDown, Table, DollarSign, Hash, Layers, BadgeCheck, Zap, TrendingUp, AlertCircle, MessageSquare, Truck, Bell, Wallet, Loader2 } from 'lucide-react'

const fmt  = v  => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtN = v  => new Intl.NumberFormat('pt-BR').format(v || 0)
const MONTHS_PT = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const STATUS_LABELS = { rascunho:'Rascunho', revisao:'Em Revisão', aprovado:'Aprovado', fechado:'Fechado' }
const STATUS_ORDER  = ['Ativo','Cancelamento','Frete','Suspenso','Pacote Mensageria','Pré-ativo']

export default function BillingCyclePage() {
  const { cycleId } = useParams()
  const navigate    = useNavigate()
  const qc          = useQueryClient()
  const { can, user } = useAuth()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)
  const [tab, setTab]       = useState('clients')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const { data: cycle, isError: cycleError } = useQuery({
    queryKey: ['cycle', cycleId],
    queryFn: () => billingApi.cycle(+cycleId).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data: clients } = useQuery({
    queryKey: ['cycle-clients', cycleId, page, search],
    queryFn: () => billingApi.clients(+cycleId, { page, per_page: 50, search: search || undefined }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
  })

  const { data: breakdown = [] } = useQuery({
    queryKey: ['cycle-breakdown', cycleId],
    queryFn: () => billingApi.breakdown(+cycleId).then(r => r.data),
    staleTime: 10 * 60 * 1000,
    enabled: tab === 'breakdown',
  })

  const { data: adjustments } = useQuery({
    queryKey: ['cycle-adjustments', cycleId],
    queryFn: () => billingApi.adjustments(+cycleId).then(r => r.data),
    staleTime: 30 * 1000,
    enabled: tab === 'adjustments',
  })

  const [excelStatus, setExcelStatus] = useState(null) // null | 'starting' | 'polling' | 'downloading'
  const [excelTask, setExcelTask] = useState(() => {
    try {
      const s = sessionStorage.getItem(`excel_task_${cycleId}`)
      return s ? JSON.parse(s) : null
    } catch { return null }
  })
  const [remessaModal, setRemessaModal] = useState(false)
  const [remessaLoading, setRemessaLoading] = useState(false)
  const [remessaVencimento, setRemessaVencimento] = useState('')
  const [remessaDescricao, setRemessaDescricao] = useState('')
  const [remessaPlanilha, setRemessaPlanilha] = useState(null)
  const [remessaFormaPgto, setRemessaFormaPgto] = useState('Boleto')
  const [remessaJuros, setRemessaJuros] = useState('1')
  const [remessaMultaValor, setRemessaMultaValor] = useState('2')
  const [remessaMultaTipo, setRemessaMultaTipo] = useState('PORCENTAGEM')

  const approveMutation = useMutation({
    mutationFn: () => billingApi.approveCycle(+cycleId),
    onSuccess: () => {
      toast.success('Ciclo aprovado! Pronto para emissão de cobranças.')
      qc.invalidateQueries({ queryKey: ['cycle', cycleId] })
      qc.invalidateQueries({ queryKey: ['billing-cycles'] })
    },
    onError: e => toast.error(e.response?.data?.detail || 'Erro ao aprovar'),
  })

  // Resume polling if page was refreshed mid-generation
  useEffect(() => {
    if (excelTask && excelStatus === null) setExcelStatus('polling')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (excelStatus !== 'polling' || !excelTask) return
    let attempts = 0
    const poll = setInterval(async () => {
      attempts++
      if (attempts > 120) {
        clearInterval(poll)
        setExcelStatus(null)
        sessionStorage.removeItem(`excel_task_${cycleId}`)
        setExcelTask(null)
        toast.error('Tempo limite de exportação excedido. Tente novamente.')
        return
      }
      try {
        const r = await billingApi.excelExportStatus(+cycleId, excelTask.task_id)
        if (r.data.status === 'ready') {
          clearInterval(poll)
          setExcelStatus('downloading')
          try {
            const r2 = await billingApi.excelDownloadFile(+cycleId, excelTask.task_id)
            _download(r2.data, excelTask.filename)
            toast.success('Planilha baixada com sucesso!')
          } catch { toast.error('Erro ao baixar planilha') }
          sessionStorage.removeItem(`excel_task_${cycleId}`)
          setExcelTask(null)
          setExcelStatus(null)
        } else if (r.data.status === 'error') {
          clearInterval(poll)
          toast.error('Erro ao gerar planilha no servidor')
          sessionStorage.removeItem(`excel_task_${cycleId}`)
          setExcelTask(null)
          setExcelStatus(null)
        }
      } catch (err) {
        // 403 = task concluída mas user_id não batem (bug de estado legado) — abortar
        if (err?.response?.status === 403 || err?.response?.status === 404) {
          clearInterval(poll)
          sessionStorage.removeItem(`excel_task_${cycleId}`)
          setExcelTask(null)
          setExcelStatus(null)
          toast.error('Exportação expirada ou inválida. Clique em "Excel" para gerar novamente.')
        }
        // outros erros de rede: continua tentando
      }
    }, 5000)
    return () => clearInterval(poll)
  }, [excelStatus, excelTask, cycleId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExcel = async () => {
    setExcelStatus('starting')
    try {
      const r = await billingApi.startExcelExport(+cycleId)
      const task = {
        task_id: r.data.task_id,
        filename: `Faturamento_${cycle?.month?.toString().padStart(2,'0')}_${cycle?.year}.xlsx`,
      }
      setExcelTask(task)
      setExcelStatus('polling')
      sessionStorage.setItem(`excel_task_${cycleId}`, JSON.stringify(task))
      toast('Gerando planilha em segundo plano... Será baixada automaticamente quando pronta.', { duration: 6000 })
    } catch {
      toast.error('Erro ao iniciar exportação')
      setExcelStatus(null)
    }
  }

  const openRemessaModal = () => {
    // Pré-preenche descrição padrão
    if (!remessaDescricao && cycle) {
      const MONTHS = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
      setRemessaDescricao(
        `[ Competência ${MONTHS[cycle.month]?.toUpperCase()} ] - Serviço de Valor Adicionado para gestão de Conectividade M2M & IoT — Pode haver valores relacionados a Mensalidades, Taxas de ativação, Cancelamentos, Fretes e Dados adicionais.`
      )
    }
    setRemessaModal(true)
  }

  const handleRemessa = async () => {
    setRemessaLoading(true)
    try {
      const fd = new FormData()
      if (remessaVencimento) fd.append('vencimento_padrao', remessaVencimento)
      fd.append('descricao', remessaDescricao)
      fd.append('forma_pagamento', remessaFormaPgto)
      fd.append('juros', remessaJuros)
      fd.append('multa_valor', remessaMultaValor)
      fd.append('multa_tipo', remessaMultaTipo)
      if (remessaPlanilha) fd.append('planilha', remessaPlanilha)
      const r = await billingApi.exportRemessa(+cycleId, fd)
      _download(r.data, `Remessa_${cycle?.month?.toString().padStart(2,'0')}_${cycle?.year}.xlsx`)
      toast.success('Remessa gerada!')
      setRemessaModal(false)
    } catch { toast.error('Erro ao gerar remessa') }
    finally { setRemessaLoading(false) }
  }

  const handleVencimentos = async () => {
    try {
      const r = await billingApi.exportVencimentos(+cycleId)
      _download(r.data, `Vencimentos_${cycle?.month?.toString().padStart(2,'0')}_${cycle?.year}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      toast.success('Planilha de vencimentos gerada!')
    } catch { toast.error('Erro ao gerar vencimentos') }
  }

  if (!cycle) {
    if (cycleError) return (
      <div className="text-gray-500 text-sm p-8">Erro ao carregar ciclo. <button onClick={() => navigate('/faturamento')} className="underline">Voltar</button></div>
    )
    return <div className="text-gray-500 text-sm p-8">Carregando...</div>
  }

  const isAprovado = cycle.status === 'aprovado' || cycle.status === 'fechado'

  return (
    <>
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <button onClick={() => navigate('/faturamento')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="gs-page-title">
            {MONTHS_PT[cycle.month]} {cycle.year}
          </h1>
          <p className="gs-page-sub">{fmtN(cycle.total_lines)} linhas · {cycle.total_boletos} boletos</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
{can('can_approve_billing') && (
            <button onClick={openRemessaModal} className="gs-btn gs-btn-outline gs-btn-sm">
              <FileDown size={14} />
              Remessa Asaas
            </button>
          )}
          {can('can_approve_billing') && (
            <button onClick={handleExcel} disabled={excelStatus !== null} className="gs-btn gs-btn-outline gs-btn-sm flex items-center gap-1.5">
              {excelStatus === 'starting'    && <><Loader2 size={14} className="animate-spin" /> Iniciando...</>}
              {excelStatus === 'polling'     && <><Loader2 size={14} className="animate-spin" /> Gerando planilha...</>}
              {excelStatus === 'downloading' && <><Loader2 size={14} className="animate-spin" /> Baixando...</>}
              {!excelStatus                  && <><Download size={14} /> Faturamento Completo</>}
            </button>
          )}
          {can('can_approve_billing') && cycle.status === 'revisao' && (
            <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}
              className="gs-btn gs-btn-green">
              <CheckCircle size={14} />
              {approveMutation.isPending ? 'Aprovando...' : 'Aprovar Ciclo'}
            </button>
          )}
        </div>
      </div>

      {/* ── Banner aprovado ── */}
      {isAprovado && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">
              Ciclo {STATUS_LABELS[cycle.status]} — {MONTHS_PT[cycle.month]} {cycle.year}
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              {cycle.approved_at
                ? `Aprovado em ${new Date(cycle.approved_at).toLocaleDateString('pt-BR')}.`
                : 'Ciclo finalizado.'}{' '}
              Baixe a <button onClick={openRemessaModal} className="underline font-medium hover:text-green-800">Remessa Asaas</button> para enviar ao time de cobranças,
              ou o <button onClick={handleExcel} disabled={excelStatus !== null} className="underline font-medium hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed">Excel completo</button>.
            </p>
          </div>
        </div>
      )}

      {/* ── Cards de breakdown ── */}
      {(() => {
        const ICON_BG = {
          green: { background: '#F0FDF4', color: '#16A34A' },
          amber: { background: '#FFFBEB', color: '#D97706' },
          red:   { background: '#FEF2F2', color: '#DC2626' },
        }
        const row1 = [
          { label: 'Mensalidade',  val: fmt(cycle.total_mensalidade  ?? 0), Icon: DollarSign,    ic: 'green' },
          { label: 'Ativação',     val: fmt(cycle.total_ativacao     ?? 0), Icon: Zap,           ic: 'amber' },
          { label: 'Excedente',    val: fmt(cycle.total_excedente    ?? 0), Icon: TrendingUp,    ic: 'red'   },
          { label: 'Cancelamento', val: fmt(cycle.total_cancelamento ?? 0), Icon: AlertCircle,   ic: 'red'   },
          { label: 'Multa',        val: fmt(cycle.total_multa        ?? 0), Icon: AlertCircle,   ic: 'red'   },
        ]
        const row2 = [
          { label: 'SMS',         val: fmt(cycle.total_sms        ?? 0), Icon: MessageSquare, ic: 'green' },
          { label: 'Frete',       val: fmt(cycle.total_frete      ?? 0), Icon: Truck,         ic: 'amber' },
          { label: 'Mensageria',  val: fmt(cycle.total_mensageria ?? 0), Icon: Bell,          ic: 'green' },
          { label: 'Total Final', val: fmt(cycle.total_final ?? cycle.total_value ?? 0), Icon: Wallet, ic: 'green', isTotal: true },
        ]
        const Card = ({ label, val, Icon, ic, isTotal }) => (
          <div key={label} className="gs-card p-4 flex items-center gap-3 min-w-0"
            style={isTotal ? { borderColor: '#3CB54A', borderWidth: 1.5 } : {}}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={ICON_BG[ic]}>
              <Icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="gs-label">{label}</p>
              <p className={`gs-value ${isTotal ? 'gs-value-green' : 'text-gray-800'}`}
                style={{ fontSize: 15, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>{val}</p>
            </div>
          </div>
        )
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {row1.map(c => <Card key={c.label} {...c} />)}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {row2.map(c => <Card key={c.label} {...c} />)}
            </div>
          </div>
        )
      })()}

      {/* ── Tabs ── */}
      <div className="gs-card overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            ['clients',    'Clientes',        null,                                      true],
            ['breakdown',  'Resumo por Status', null,                                   can('can_approve_billing') || (can('can_edit_billing') && user?.role !== 'contas_receber')],
            ['adjustments','Ajustes',          adjustments?.length > 0 ? adjustments.length : null, true],
          ].filter(([,,, visible]) => visible).map(([k, l, badge]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 ${
                tab === k ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {l}
              {badge !== null && (
                typeof badge === 'number'
                  ? <span className="ml-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">{badge}</span>
                  : badge
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: Clientes ── */}
        {tab === 'clients' && (
          <div>
            <div className="p-4 border-b border-gray-100">
              <div className="relative max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Buscar por nome ou ID..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
            {(() => {
              const COLS = [
                { key: 'client_nome',        label: 'Cliente',       fixed: true },
                { key: 'total_mensalidade',  label: 'Mensalidade' },
                { key: 'total_ativacao',     label: 'Ativação' },
                { key: 'total_excedente',    label: 'Excedente' },
                { key: 'total_cancelamento', label: 'Cancelamento' },
                { key: 'total_multa',        label: 'Multa' },
                { key: 'total_sms',          label: 'SMS' },
                { key: 'total_frete',        label: 'Frete' },
                { key: 'total_mensageria',   label: 'Mensageria' },
                { key: 'total_final',        label: 'Total' },
              ]
              const handleSort = (key) => {
                if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
                else { setSortCol(key); setSortDir('asc') }
              }
              const items = [...(clients?.items || [])].sort((a, b) => {
                if (!sortCol) return 0
                const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0
                if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
                return sortDir === 'asc' ? av - bv : bv - av
              })
              return (<>
            <div className="flex border-b border-gray-100 min-w-[1100px]" style={{background:'#F9FAFB'}}>
              {COLS.map(({ key, label, fixed }) => (
                <div key={key}
                  className={`${fixed ? 'w-56 shrink-0' : 'flex-1'} gs-th cursor-pointer select-none hover:text-gray-600`}
                  onClick={() => handleSort(key)}>
                  <span className="inline-flex items-center justify-center gap-1">
                    {label}
                    <span className="text-gray-400">{sortCol === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </span>
                </div>
              ))}
              <div className="w-8 shrink-0 gs-th" />
            </div>

            {items.map(c => (
              <div key={c.id_smart}
                onClick={() => navigate(`/faturamento/${cycleId}/cliente/${encodeURIComponent(c.id_smart)}`)}
                className="flex px-0 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer text-sm items-center min-w-[1100px]">
                <div className="w-56 shrink-0 px-4">
                  <p className="font-medium text-gray-800 truncate">{c.client_nome || c.id_smart}</p>
                  <p className="text-xs text-gray-400 font-mono">{c.id_smart}</p>
                </div>
                <div className="flex-1 text-center text-gray-700">{fmt(c.total_mensalidade)}</div>
                <div className="flex-1 text-center text-gray-700">{fmt(c.total_ativacao)}</div>
                <div className="flex-1 text-center text-gray-700">{fmt(c.total_excedente)}</div>
                <div className="flex-1 text-center text-gray-700">{fmt(c.total_cancelamento)}</div>
                <div className="flex-1 text-center text-gray-700">{fmt(c.total_multa)}</div>
                <div className="flex-1 text-center text-gray-700">{fmt(c.total_sms)}</div>
                <div className="flex-1 text-center text-gray-700">{fmt(c.total_frete)}</div>
                <div className="flex-1 text-center text-gray-700">{fmt(c.total_mensageria)}</div>
                <div className="flex-1 text-center font-semibold text-gray-900">{fmt(c.total_final)}</div>
                <div className="w-8 shrink-0 flex justify-end pr-2">
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </div>
            ))}
            </>)})()}
            </div>{/* end overflow-x-auto */}

            {clients?.total > 50 && (
              <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500 border-t border-gray-100">
                <span>Mostrando {(page-1)*50+1}–{Math.min(page*50, clients.total)} de {fmtN(clients.total)}</span>
                <div className="flex gap-2">
                  <button disabled={page===1} onClick={() => setPage(p => p-1)} className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">← Anterior</button>
                  <button disabled={page*50>=clients.total} onClick={() => setPage(p => p+1)} className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Próximo →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Resumo por Status ── */}
        {tab === 'breakdown' && (
          <div className="p-5">
            <p className="text-xs text-gray-500 mb-4">
              Valores das <strong>linhas individuais</strong> por status. O Total Geral reflete o valor dos boletos (inclui fretes, cancelamentos e mensageria).
            </p>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="gs-th" style={{textAlign:'left'}}>Status</th>
                  <th className="gs-th gs-th-right">Qtd Linhas</th>
                  <th className="gs-th gs-th-right">Total (R$)</th>
                </tr>
              </thead>
              <tbody>
                {[...breakdown]
                  .sort((a,b) => {
                    if (a.status === 'Total Geral') return 1
                    if (b.status === 'Total Geral') return -1
                    return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
                  })
                  .map((row, i) => (
                    <tr key={row.status}
                      className={`border-b border-gray-100 ${row.status === 'Total Geral' ? 'bg-green-50 font-semibold' : i%2===0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {row.qtd !== null ? fmtN(row.qtd) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${row.status==='Total Geral' ? 'text-green-700' : 'text-gray-900'}`}>
                        {fmt(row.total)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* ── Tab: Ajustes ── */}
        {tab === 'adjustments' && (
          <AdjustmentsTab adjustments={adjustments || []} cycleId={cycleId} qc={qc} can={can} />
        )}
      </div>
    </div>

    {/* ── Modal Remessa Asaas ── */}

    {remessaModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="gs-card w-full max-w-lg p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="gs-section-title text-base">Exportar Remessa Asaas</h2>
            <button onClick={() => setRemessaModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>

          {/* Vencimento padrão */}
          <div>
            <label className="gs-label block mb-1">Vencimento padrão <span className="normal-case font-normal text-gray-400">(opcional)</span></label>
            <input
              type="date"
              value={remessaVencimento}
              onChange={e => setRemessaVencimento(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <p className="text-xs text-gray-400 mt-1">Aplicado para clientes sem data específica na planilha.</p>
          </div>

          {/* Descrição */}
          <div>
            <label className="gs-label block mb-1">Descrição</label>
            <textarea
              value={remessaDescricao}
              onChange={e => setRemessaDescricao(e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
              placeholder="Descrição que aparecerá nos boletos..."
            />
          </div>

          {/* Cobrança */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="gs-label block mb-1">Forma de pagamento</label>
              <select value={remessaFormaPgto} onChange={e => setRemessaFormaPgto(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                <option>Boleto</option>
                <option>Cartão</option>
              </select>
            </div>
            <div>
              <label className="gs-label block mb-1">% Juros ao mês</label>
              <input type="number" min="0" step="0.1" value={remessaJuros} onChange={e => setRemessaJuros(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div>
              <label className="gs-label block mb-1">Valor Multa</label>
              <input type="number" min="0" step="0.1" value={remessaMultaValor} onChange={e => setRemessaMultaValor(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div>
              <label className="gs-label block mb-1">Tipo da Multa</label>
              <select value={remessaMultaTipo} onChange={e => setRemessaMultaTipo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                <option value="PORCENTAGEM">Porcentagem</option>
                <option value="FIXO">Fixo</option>
              </select>
            </div>
          </div>

          {/* Upload planilha */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="gs-label">Planilha de vencimentos (opcional)</label>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const r = await billingApi.exportRemessaTemplate(+cycleId)
                    _download(r.data, `Modelo_Vencimentos_${cycle?.month?.toString().padStart(2,'0')}_${cycle?.year}.xlsx`)
                  } catch { toast.error('Erro ao baixar modelo') }
                }}
                className="text-xs text-green-600 hover:underline flex items-center gap-1"
              >
                <Download size={11} /> Baixar modelo
              </button>
            </div>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-green-400 transition-colors">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={e => setRemessaPlanilha(e.target.files[0] || null)}
                className="hidden"
                id="remessa-file"
              />
              <label htmlFor="remessa-file" className="cursor-pointer">
                {remessaPlanilha ? (
                  <p className="text-sm text-green-700 font-medium">{remessaPlanilha.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-500">Clique para selecionar .xlsx ou .csv</p>
                    <p className="text-xs text-gray-400 mt-1">Colunas: <code className="bg-gray-100 px-1 rounded">id_smart</code> · <code className="bg-gray-100 px-1 rounded">vencimento</code></p>
                  </>
                )}
              </label>
            </div>
            {remessaPlanilha && (
              <button onClick={() => setRemessaPlanilha(null)} className="text-xs text-red-500 mt-1 hover:underline">Remover arquivo</button>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={() => setRemessaModal(false)} className="gs-btn gs-btn-outline flex-1">Cancelar</button>
            <button onClick={handleRemessa} disabled={remessaLoading} className="gs-btn gs-btn-primary flex-1">
              {remessaLoading ? <><Loader2 size={14} className="animate-spin" /> Gerando...</> : <><FileDown size={14} /> Exportar</>}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────

function _download(data, filename, mime) {
  const blob = mime ? new Blob([data], { type: mime }) : new Blob([data])
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function StatusBadge({ status }) {
  return (
    <span className={`text-sm ${status === 'Total Geral' ? 'font-semibold text-green-700' : 'text-gray-700'}`}>
      {status}
    </span>
  )
}

function AdjustmentsTab({ adjustments, cycleId, qc, can }) {
  const approveMutation = useMutation({
    mutationFn: ({ adjId, approved }) => billingApi.approveAdjustment(+cycleId, adjId, { approved }),
    onSuccess: () => { toast.success('Atualizado!'); qc.invalidateQueries({ queryKey: ['cycle-adjustments', cycleId] }) },
    onError: (e) => toast.error(e.response?.data?.detail || 'Erro ao atualizar ajuste'),
  })

  if (adjustments.length === 0)
    return <div className="p-8 text-center text-gray-400 text-sm">Nenhum ajuste registrado neste ciclo</div>

  const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

  return (
    <div>
      {adjustments.map(a => (
        <div key={a.id} className="px-5 py-4 border-b border-gray-100 last:border-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-800">{a.id_smart}</span>
                <AdjTypeBadge type={a.type} />
                {a.requires_approval && !a.approved_at && (
                  <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">Aguarda aprovação</span>
                )}
              </div>
              <p className="text-sm text-gray-600">{a.justificativa}</p>
              <p className="text-xs text-gray-400 mt-1">
                Componente: {a.component} · Original: {fmt(a.valor_original)} → Ajustado: {fmt(a.valor_ajustado)} ({a.valor_diferenca >= 0 ? '+' : ''}{fmt(a.valor_diferenca)})
              </p>
            </div>
            {can('can_approve_adjustment') && a.requires_approval && !a.approved_at && (
              <div className="flex gap-2">
                <button onClick={() => approveMutation.mutate({ adjId: a.id, approved: true })}
                  disabled={approveMutation.isPending}
                  className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50">Aprovar</button>
                <button onClick={() => approveMutation.mutate({ adjId: a.id, approved: false })}
                  disabled={approveMutation.isPending}
                  className="px-3 py-1.5 border border-red-300 text-red-600 text-xs rounded-lg hover:bg-red-50 disabled:opacity-50">Rejeitar</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function AdjTypeBadge({ type }) {
  const map    = { desconto:'bg-green-100 text-green-700', acrescimo:'bg-red-100 text-red-700', isencao:'bg-teal-100 text-teal-700', correcao:'bg-blue-100 text-blue-700' }
  const labels = { desconto:'Desconto', acrescimo:'Acréscimo', isencao:'Isenção', correcao:'Correção' }
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${map[type] || 'bg-gray-100'}`}>{labels[type] || type}</span>
}
