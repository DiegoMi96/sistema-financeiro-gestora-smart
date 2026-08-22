import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { Brain, RefreshCw, Clock, Zap, ChevronDown, AlertCircle, TrendingDown } from 'lucide-react'
import api from '../../services/api'

const MONTHS_PT = [
  { value: 1, label: 'Janeiro' }, { value: 2,  label: 'Fevereiro' },
  { value: 3, label: 'Março' },   { value: 4,  label: 'Abril' },
  { value: 5, label: 'Maio' },    { value: 6,  label: 'Junho' },
  { value: 7, label: 'Julho' },   { value: 8,  label: 'Agosto' },
  { value: 9, label: 'Setembro'}, { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro'},{ value: 12, label: 'Dezembro' },
]

const mdComponents = {
  h2: ({ children }) => (
    <h2 className="text-base font-bold text-gray-900 mt-6 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-1">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm text-gray-700 leading-relaxed mb-3">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="space-y-1.5 mb-3 ml-1">{children}</ul>
  ),
  li: ({ children }) => (
    <li className="text-sm text-gray-700 leading-relaxed flex gap-2">
      <span className="text-green-500 mt-0.5 shrink-0">•</span>
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
}

function fmtDt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ErrorCard({ error }) {
  return (
    <div className="gs-card p-5 flex gap-3 items-start border-amber-200">
      <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-gray-800 mb-1">Diagnóstico indisponível</p>
        <p className="text-sm text-gray-500">
          {error?.response?.data?.detail || 'Não foi possível gerar o diagnóstico. Verifique a configuração da chave de API.'}
        </p>
      </div>
    </div>
  )
}

function LoadingCard({ label }) {
  return (
    <div className="gs-card p-10 flex flex-col items-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center">
        <Brain size={22} className="text-green-500 animate-pulse" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Gerando diagnóstico…</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  )
}

function ResultCard({ diagData }) {
  return (
    <div className="gs-card p-6">
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {diagData.cached ? (
            <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-100 rounded-full px-2.5 py-1">
              <Clock size={11} />
              Em cache
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 rounded-full px-2.5 py-1">
              <Zap size={11} />
              Gerado agora
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">{fmtDt(diagData.created_at)}</span>
      </div>
      <div>
        <ReactMarkdown components={mdComponents}>
          {diagData.content}
        </ReactMarkdown>
      </div>
    </div>
  )
}

function DiagnosticoCiclo() {
  const [selectedCycle, setSelectedCycle] = useState(null)
  const queryClient = useQueryClient()

  const { data: cycles = [], isLoading: loadingCycles } = useQuery({
    queryKey: ['billing-cycles-ia'],
    queryFn: () => api.get('/billing/cycles').then(r => {
      const list = r.data || []
      const approved = list.filter(c => c.status === 'aprovado' || c.status === 'fechado')
      if (approved.length > 0 && !selectedCycle) {
        setSelectedCycle(approved[0].id)
      }
      return list
    }),
    staleTime: 5 * 60 * 1000,
  })

  const queryKey = ['ai-diagnosis', selectedCycle]

  // Busca normal: sempre serve o que já foi gerado (cache do backend), sem
  // comparar se os dados mudaram — só o botão "Atualizar" força um novo.
  const { data: diagData, isLoading: loadingDiag, error } = useQuery({
    queryKey,
    queryFn: () => api.get(`/ai/diagnosis/${selectedCycle}`).then(r => r.data),
    enabled: !!selectedCycle,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  // "Atualizar" é uma ação explícita e separada — só ela manda force_refresh.
  const refreshMutation = useMutation({
    mutationFn: () => api.get(`/ai/diagnosis/${selectedCycle}?force_refresh=true`).then(r => r.data),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  })

  const eligibleCycles = cycles.filter(c => c.status === 'aprovado' || c.status === 'fechado')
  const selectedLabel = eligibleCycles.find(c => c.id === selectedCycle)
    ? `${String(eligibleCycles.find(c => c.id === selectedCycle).month).padStart(2, '0')}/${eligibleCycles.find(c => c.id === selectedCycle).year}`
    : ''

  const isBusy = loadingDiag || refreshMutation.isPending

  return (
    <>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <p className="gs-page-sub">Análise executiva gerada automaticamente a partir dos dados do ciclo</p>
        <div className="flex items-center gap-2">
          {eligibleCycles.length > 0 && (
            <div className="relative">
              <select
                className="gs-select pr-8 appearance-none cursor-pointer text-sm"
                value={selectedCycle || ''}
                onChange={e => setSelectedCycle(Number(e.target.value))}
              >
                {eligibleCycles.map(c => (
                  <option key={c.id} value={c.id}>
                    {String(c.month).padStart(2, '0')}/{c.year}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={!selectedCycle || isBusy}
            className="gs-btn gs-btn-outline gs-btn-sm flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={isBusy ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {(error || refreshMutation.error) && <ErrorCard error={error || refreshMutation.error} />}
      {isBusy && !diagData && <LoadingCard label={`Analisando os dados do ciclo ${selectedLabel}`} />}

      {!loadingCycles && eligibleCycles.length === 0 && (
        <div className="gs-card p-8 text-center">
          <p className="text-sm text-gray-500">Nenhum ciclo aprovado ou fechado encontrado.</p>
          <p className="text-xs text-gray-400 mt-1">Aprove um ciclo de faturamento para gerar o diagnóstico.</p>
        </div>
      )}

      {diagData && <ResultCard diagData={diagData} />}
    </>
  )
}

function DiagnosticoOperacional() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear())
  const queryClient = useQueryClient()

  const availableYears = [now.getFullYear(), now.getFullYear() - 1]
  const queryKey = ['ai-diagnosis-operacional', selectedMonth, selectedYear]

  // Busca normal: sempre serve o que já foi gerado (cache do backend), sem
  // comparar se os dados mudaram — só o botão "Atualizar" força um novo.
  // Antes disso, o simples fato de abrir a tela (e logar) já mudava os
  // dados de uso da plataforma no contexto, e isso disparava um diagnóstico
  // novo sem o Diego pedir (reportado em 22/08/2026).
  const { data: diagData, isLoading: loadingDiag, error } = useQuery({
    queryKey,
    queryFn: () => api.get(`/ai/diagnosis-operacional?month=${selectedMonth}&year=${selectedYear}`).then(r => r.data),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  // "Atualizar" é uma ação explícita e separada — só ela manda force_refresh.
  const refreshMutation = useMutation({
    mutationFn: () => api.get(`/ai/diagnosis-operacional?month=${selectedMonth}&year=${selectedYear}&force_refresh=true`).then(r => r.data),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  })

  const isBusy = loadingDiag || refreshMutation.isPending

  return (
    <>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <p className="gs-page-sub">Inadimplência/adimplência dos clientes e uso da plataforma pela equipe, com ações imediatas</p>
        <div className="flex items-center gap-2">
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
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={isBusy}
            className="gs-btn gs-btn-outline gs-btn-sm flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={isBusy ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {(error || refreshMutation.error) && <ErrorCard error={error || refreshMutation.error} />}
      {isBusy && !diagData && (
        <LoadingCard label={`Analisando cobrança e uso — ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`} />
      )}
      {diagData && <ResultCard diagData={diagData} />}
    </>
  )
}

export default function DiagnosticoIAPage() {
  const [tab, setTab] = useState('ciclo')

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Cabeçalho */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center">
            <Brain size={16} className="text-green-600" />
          </div>
          <h1 className="gs-page-title">Diagnóstico por IA</h1>
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-100">
        <button
          onClick={() => setTab('ciclo')}
          className={`px-3.5 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'ciclo' ? 'border-green-500 text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Ciclo de Faturamento
        </button>
        <button
          onClick={() => setTab('operacional')}
          className={`px-3.5 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            tab === 'operacional' ? 'border-green-500 text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <TrendingDown size={13} />
          Operacional e Cobrança
        </button>
      </div>

      {tab === 'ciclo' ? <DiagnosticoCiclo /> : <DiagnosticoOperacional />}
    </div>
  )
}
