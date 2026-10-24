import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { cobrancaApi } from '../../services/api'
import { dataBR } from './ui'

export default function PausasTab({ onChange }) {
  const { data, refetch } = useQuery({ queryKey: ['cobranca-pausas'], queryFn: () => cobrancaApi.pausas().then(r => r.data), staleTime: 0 })
  const [id, setId] = useState('')
  const [ate, setAte] = useState('')
  const [motivo, setMotivo] = useState('')

  const criar = async () => {
    const idc = id.trim().startsWith('ss_') ? id.trim() : `ss_${id.replace(/\D/g, '')}`
    try { await cobrancaApi.criarPausa({ id_smart: idc, ate: ate || null, motivo }); toast.success('Cliente pausado'); setId(''); setAte(''); setMotivo(''); refetch(); onChange() }
    catch (e) { toast.error(e.response?.data?.detail || 'Erro ao pausar') }
  }
  const retomar = async (p) => {
    try { await cobrancaApi.removerPausa(p.id); toast.success('Cliente volta para a régua'); refetch(); onChange() } catch { toast.error('Erro ao retomar') }
  }

  return (
    <div className="p-5 space-y-4">
      <p className="text-sm text-gray-600">Clientes pausados não recebem nenhuma mensagem da régua. Use para negociação ou promessa de pagamento.</p>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs text-gray-500">CNPJ/CPF
          <input value={id} onChange={e => setId(e.target.value)} placeholder="só números" className="block border border-gray-200 rounded-lg p-2 text-sm mt-1 w-44 text-gray-800" /></label>
        <label className="text-xs text-gray-500">Até (opcional)
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} className="block border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800" /></label>
        <label className="text-xs text-gray-500 flex-1 min-w-[200px]">Motivo
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: promessa de pagamento" className="block border border-gray-200 rounded-lg p-2 text-sm mt-1 w-full text-gray-800" /></label>
        <button onClick={criar} disabled={!id.trim()} className="text-sm px-3 py-2 rounded-lg bg-green-600 text-white disabled:opacity-40">Pausar</button>
      </div>
      <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
        {(data || []).length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">Nenhum cliente pausado.</p>}
        {(data || []).map(p => (
          <div key={p.id} className="px-4 py-3 flex items-center gap-3 text-sm">
            <div className="flex-1 min-w-0"><p className="text-gray-800 truncate">{p.nome}</p><p className="text-xs text-gray-400">{p.id_smart} · {p.motivo || 'sem motivo'}</p></div>
            <span className="text-xs text-gray-500">{p.ate ? `até ${dataBR(p.ate)}` : 'sem prazo'}</span>
            <button onClick={() => retomar(p)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Retomar</button>
          </div>
        ))}
      </div>
    </div>
  )
}
