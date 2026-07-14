import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { Upload, Search, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Database } from 'lucide-react'

const fmt  = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtN = v => new Intl.NumberFormat('pt-BR').format(v || 0)
const fmtMb = v => v ? `${fmtN(v)} MB` : '—'

export default function AllcomPage() {
  const qc = useQueryClient()
  const fileRef = useRef()
  const [selectedRef, setSelectedRef] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [uploadResult, setUploadResult] = useState(null)

  const { data: refs = [] } = useQuery({
    queryKey: ['allcom-refs'],
    queryFn: () => api.get('/contestation/allcom/refs').then(r => r.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['allcom-pedidos', selectedRef, search, page],
    queryFn: () => api.get('/contestation/allcom/pedidos', {
      params: { upload_ref: selectedRef || undefined, search: search || undefined, page, per_page: 100 }
    }).then(r => r.data),
    keepPreviousData: true,
  })

  const statsRef = selectedRef || refs[0]?.ref || ''

  const { data: stats } = useQuery({
    queryKey: ['allcom-stats', statsRef],
    queryFn: () => api.get('/contestation/allcom/stats', {
      params: { upload_ref: statsRef || undefined }
    }).then(r => r.data),
    enabled: !!statsRef,
  })

  const upload = useMutation({
    mutationFn: (file) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/contestation/allcom/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: (r) => {
      setUploadResult(r.data)
      qc.invalidateQueries(['allcom-refs'])
      qc.invalidateQueries(['allcom-pedidos'])
      qc.invalidateQueries(['allcom-stats'])
      if (r.data.duplicatas > 0) {
        toast(`${r.data.novos} novos pedidos importados. ${r.data.duplicatas} duplicatas ignoradas.`, { icon: '⚠️' })
      } else {
        toast.success(`${r.data.novos} pedidos importados com sucesso!`)
      }
    },
    onError: () => toast.error('Erro ao importar planilha'),
  })

  const items = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / 100)
  const porContrato = stats?.por_contrato || []


  return (
    <div className="space-y-5">
      {/* Header + upload */}
      <div className="gs-card p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Pedidos a Pagar — Allcom</h2>
          <p className="text-xs text-gray-500 mt-0.5">Upload mensal da planilha da Allcom. Pedidos duplicados são detectados e ignorados automaticamente.</p>
        </div>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden"
            onChange={e => { if (e.target.files[0]) upload.mutate(e.target.files[0]); e.target.value = '' }} />
          <button
            onClick={() => fileRef.current.click()}
            disabled={upload.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
            <Upload size={15} />
            {upload.isPending ? 'Importando...' : 'Upload planilha'}
          </button>
        </div>
      </div>

      {/* Resultado do upload */}
      {uploadResult && (
        <div className={`rounded-xl p-4 flex items-start gap-3 ${uploadResult.duplicatas > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
          {uploadResult.duplicatas > 0
            ? <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            : <CheckCircle2 size={18} className="text-green-600 shrink-0 mt-0.5" />}
          <div className="text-sm">
            <p className="font-semibold text-gray-800">
              {uploadResult.novos} pedidos importados · {uploadResult.duplicatas} duplicatas ignoradas
            </p>
            {uploadResult.duplicatas > 0 && (
              <p className="text-gray-500 text-xs mt-1">
                IDs duplicados: {uploadResult.duplicatas_ids.join(', ')}{uploadResult.duplicatas > 20 ? '...' : ''}
              </p>
            )}
          </div>
          <button onClick={() => setUploadResult(null)} className="ml-auto text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
      )}

      {/* Filtros */}
      <div className="gs-card p-4 flex flex-wrap gap-3 items-center">
        <select
          value={selectedRef}
          onChange={e => { setSelectedRef(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">Todos os meses</option>
          {refs.map(r => (
            <option key={r.ref} value={r.ref}>{r.ref} ({fmtN(r.qtd)} pedidos)</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por descrição ou contrato..."
            className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <span className="text-xs text-gray-400">{fmtN(total)} pedidos</span>
      </div>


      {/* Tabela */}
      <div className="gs-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1400px]">
            <thead>
              <tr>
                {['ID','Descrição','Contrato','Tipo de compartilhamento','Franquia','Mensalidade','Preço de ativação','Preço do exc.','Data de ativação','Prazo de pré-ativação'].map(h => (
                  <th key={h} className="gs-th text-center">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="py-12 text-center text-gray-400 text-xs">Carregando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={10} className="py-12 text-center text-gray-400 text-xs">Nenhum pedido encontrado.</td></tr>
              ) : items.map(p => (
                <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-500">{p.pedido_id}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 max-w-[220px] truncate" title={p.descricao}>{p.descricao || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-center text-gray-600 whitespace-nowrap">{p.contrato || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-center text-gray-600">{p.tipo_compartilhamento || '—'}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-gray-600">{fmtMb(p.franquia_mb)}</td>
                  <td className="px-4 py-2.5 text-center font-medium text-gray-800">{fmt(p.mensalidade)}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{fmt(p.preco_ativacao)}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{p.preco_exc_mb ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-gray-500">
                    {p.data_ativacao ? new Date(p.data_ativacao + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-gray-600">
                    {p.pre_ativacao_dias != null ? `${p.pre_ativacao_dias} dias` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Página {page} de {totalPages} · {fmtN(total)} pedidos</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="p-1 border rounded hover:bg-gray-50 disabled:opacity-40"><ChevronLeft size={14} /></button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="p-1 border rounded hover:bg-gray-50 disabled:opacity-40"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
