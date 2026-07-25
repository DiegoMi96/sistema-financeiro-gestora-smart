import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { Brain, RefreshCw, Clock, Zap, ChevronDown, AlertCircle } from 'lucide-react'
import api from '../../services/api'

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

export default function DiagnosticoIAPage() {
  const [selectedCycle, setSelectedCycle] = useState(null)
  const [diagData, setDiagData] = useState(null)
  const [forceRefresh, setForceRefresh] = useState(false)

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

  const { isLoading: loadingDiag, error } = useQuery({
    queryKey: ['ai-diagnosis', selectedCycle, forceRefresh],
    queryFn: () =>
      api.get(`/ai/diagnosis/${selectedCycle}${forceRefresh ? '?force_refresh=true' : ''}`).then(r => {
        setDiagData(r.data)
        setForceRefresh(false)
        return r.data
      }),
    enabled: !!selectedCycle,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  const eligibleCycles = cycles.filter(c => c.status === 'aprovado' || c.status === 'fechado')
  const selectedLabel = eligibleCycles.find(c => c.id === selectedCycle)
    ? `${String(eligibleCycles.find(c => c.id === selectedCycle).month).padStart(2, '0')}/${eligibleCycles.find(c => c.id === selectedCycle).year}`
    : ''

  function handleRefresh() {
    setDiagData(null)
    setForceRefresh(true)
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Cabeçalho */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center">
              <Brain size={16} className="text-green-600" />
            </div>
            <h1 className="gs-page-title">Diagnóstico por IA</h1>
          </div>
          <p className="gs-page-sub">Análise executiva gerada automaticamente a partir dos dados do ciclo</p>
        </div>

        {/* Controles */}
        <div className="flex items-center gap-2">
          {eligibleCycles.length > 0 && (
            <div className="relative">
              <select
                className="gs-select pr-8 appearance-none cursor-pointer text-sm"
                value={selectedCycle || ''}
                onChange={e => { setSelectedCycle(Number(e.target.value)); setDiagData(null) }}
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
            onClick={handleRefresh}
            disabled={!selectedCycle || loadingDiag}
            className="gs-btn gs-btn-outline gs-btn-sm flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={loadingDiag ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Erro sem API key */}
      {error && (
        <div className="gs-card p-5 flex gap-3 items-start border-amber-200">
          <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-1">Diagnóstico indisponível</p>
            <p className="text-sm text-gray-500">
              {error?.response?.data?.detail || 'Não foi possível gerar o diagnóstico. Verifique a configuração da chave de API.'}
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loadingDiag && !diagData && (
        <div className="gs-card p-10 flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center">
            <Brain size={22} className="text-green-500 animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700 mb-1">Gerando diagnóstico…</p>
            <p className="text-xs text-gray-400">Analisando os dados do ciclo {selectedLabel}</p>
          </div>
        </div>
      )}

      {/* Sem ciclos elegíveis */}
      {!loadingCycles && eligibleCycles.length === 0 && (
        <div className="gs-card p-8 text-center">
          <p className="text-sm text-gray-500">Nenhum ciclo aprovado ou fechado encontrado.</p>
          <p className="text-xs text-gray-400 mt-1">Aprove um ciclo de faturamento para gerar o diagnóstico.</p>
        </div>
      )}

      {/* Resultado */}
      {diagData && (
        <div className="gs-card p-6">
          {/* Meta */}
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

          {/* Conteúdo markdown */}
          <div>
            <ReactMarkdown components={mdComponents}>
              {diagData.content}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
