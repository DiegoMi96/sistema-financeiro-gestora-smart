import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import toast from 'react-hot-toast'
import {
  Plus, AlertCircle, ChevronRight, FileText,
  CheckCircle, Clock, Send, DollarSign, Upload
} from 'lucide-react'

const fmt  = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const MESES = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const STATUS_MAP = {
  rascunho:        { label: 'Processando',     bg: 'bg-gray-100',    text: 'text-gray-600' },
  revisao:         { label: 'Em revisão',       bg: 'bg-yellow-100',  text: 'text-yellow-700' },
  aprovado:        { label: 'Aprovado',         bg: 'bg-blue-100',    text: 'text-blue-700' },
  enviado:         { label: 'Enviado',          bg: 'bg-blue-100',    text: 'text-blue-700' },
  credito_parcial: { label: 'Crédito parcial',  bg: 'bg-orange-100',  text: 'text-orange-700' },
  credito_total:   { label: 'Crédito recebido', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  encerrado:       { label: 'Encerrado',        bg: 'bg-gray-100',    text: 'text-gray-500' },
}

export default function ContestationPage() {
  const [showUpload, setShowUpload] = useState(false)
  const navigate  = useNavigate()
  const qc        = useQueryClient()

  const { data: cycles = [], isLoading } = useQuery({
    queryKey: ['contestation-cycles'],
    queryFn:  () => api.get('/contestation/cycles').then(r => r.data),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contestação</h1>
          <p className="text-gray-400 text-sm mt-0.5">Análise e contestação de cobranças do fornecedor</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium"
        >
          <Plus size={16} />
          Nova Contestação
        </button>
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => { setShowUpload(false); qc.invalidateQueries(['contestation-cycles']) }}
        />
      )}

      {isLoading ? (
        <div className="text-gray-400 text-sm">Carregando...</div>
      ) : cycles.length === 0 ? (
        <EmptyState onNew={() => setShowUpload(true)} />
      ) : (
        <div className="space-y-3">
          {cycles.map(c => {
            const st = STATUS_MAP[c.status] || STATUS_MAP.rascunho
            return (
              <div key={c.id}
                onClick={() => navigate(`/contestacao/${c.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between cursor-pointer hover:border-orange-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                    <AlertCircle size={20} className="text-orange-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{MESES[c.month]} {c.year}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {(c.total_itens_detectados || 0).toLocaleString('pt-BR')} itens detectados ·{' '}
                      {(c.total_itens_contestar || 0).toLocaleString('pt-BR')} para contestar
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="font-bold text-gray-900 text-red-600">{fmt(c.valor_total_contestado)}</p>
                    <p className="text-xs text-gray-400">a contestar</p>
                    {c.valor_total_credito > 0 && (
                      <p className="text-xs text-emerald-600 font-medium">{fmt(c.valor_total_credito)} recebido</p>
                    )}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>
                    {st.label}
                  </span>
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Upload Modal ──────────────────────────────────────────────

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function UploadModal({ onClose, onSuccess }) {
  const [year, setYear]   = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [files, setFiles] = useState({})
  const [loading, setLoading] = useState(false)

  const FILE_FIELDS = [
    { key: 'faturamento', label: 'Base de Faturamento *',     hint: '05_Maio_2026.xlsx' },
    { key: 'fornecedor',  label: 'Detalhamento Fornecedor *', hint: 'DETALHAMENTO_SMART_SIM_Ref_Maio-26.xlsb' },
    { key: 'contratos',   label: 'Tabela de Contratos *',     hint: 'Inventory_18421_YYYY.xlsx' },
  ]

  const allReady = FILE_FIELDS.every(f => files[f.key])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!allReady) return toast.error('Selecione os 3 arquivos')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('faturamento_file', files.faturamento)
      fd.append('fornecedor_file',  files.fornecedor)
      fd.append('contratos_file',   files.contratos)
      await api.post(`/contestation/cycles/process?year=${year}&month=${month}`, fd,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 })
      toast.success('Processamento iniciado!')
      onSuccess()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao processar')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Nova Contestação</h2>
          <p className="text-xs text-gray-400 mt-0.5">Selecione o período e os 3 arquivos</p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mês de referência</label>
              <select value={month} onChange={e => setMonth(+e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none">
                {MONTHS_PT.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ano</label>
              <input type="number" value={year} onChange={e => setYear(+e.target.value)} min={2024} max={2030}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
            </div>
          </div>
          {FILE_FIELDS.map(({ key, label, hint }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
              <div className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm ${files[key] ? 'border-emerald-300 bg-emerald-50' : 'border-gray-300'}`}>
                <Upload size={14} className={files[key] ? 'text-emerald-500' : 'text-gray-400'} />
                <label className="flex-1 cursor-pointer">
                  <span className={files[key] ? 'text-emerald-700 font-medium' : 'text-gray-400'}>
                    {files[key]?.name || hint}
                  </span>
                  <input type="file" accept=".xlsx,.xls,.xlsb" className="hidden"
                    onChange={e => setFiles(p => ({...p, [key]: e.target.files[0]}))} />
                </label>
                {files[key] && <CheckCircle size={14} className="text-emerald-500" />}
              </div>
            </div>
          ))}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading || !allReady}
              className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white px-4 py-2.5 rounded-lg text-sm font-medium">
              {loading ? 'Processando...' : 'Processar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EmptyState({ onNew }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
      <AlertCircle size={40} className="text-gray-300 mx-auto mb-4" />
      <h3 className="text-gray-700 font-medium mb-1">Nenhuma contestação</h3>
      <p className="text-gray-400 text-sm mb-4">Faça upload dos 3 arquivos para iniciar</p>
      <button onClick={onNew}
        className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
        Iniciar contestação
      </button>
    </div>
  )
}
