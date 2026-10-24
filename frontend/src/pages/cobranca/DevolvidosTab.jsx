import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MailX, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { cobrancaApi } from '../../services/api'
import { horaBR } from './ui'

export default function DevolvidosTab({ onChange }) {
  const qc = useQueryClient()
  const [lendo, setLendo] = useState(false)
  const { data } = useQuery({ queryKey: ['cobranca-invalidos'], queryFn: () => cobrancaApi.emailsInvalidos().then(r => r.data), staleTime: 0 })
  const lista = data || []
  const recarrega = () => { qc.invalidateQueries({ queryKey: ['cobranca-invalidos'] }); onChange() }
  const ler = async () => {
    setLendo(true)
    try {
      const { data: d } = await cobrancaApi.lerDevolucoes()
      if (d.erro) toast.error(d.erro)
      else toast.success(`${d.lidas} devolução(ões) lida(s): ${d.invalidados} endereço(s) marcado(s) como inválido(s)`)
      recarrega()
    } catch (e) { toast.error(e.response?.data?.detail || 'Erro ao ler a caixa') } finally { setLendo(false) }
  }
  const liberar = async (email) => {
    try { await cobrancaApi.liberarEmail(email); toast.success('Endereço liberado: a régua volta a usá-lo'); recarrega() } catch { toast.error('Erro ao liberar') }
  }
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-600 max-w-2xl">Endereços que <b>devolveram</b> o e-mail (falha permanente). A régua não envia para eles até você corrigir o e-mail do cliente e liberar. Corrija o e-mail na aba <b>Clientes</b>; se o novo endereço for diferente, ele já vale sozinho.</p>
        <button onClick={ler} disabled={lendo} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5"><RefreshCw size={12} className={lendo ? 'animate-spin' : ''} /> Verificar devoluções agora</button>
      </div>
      <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
        {lista.length === 0 && <p className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma devolução registrada.</p>}
        {lista.map(i => (
          <div key={i.email} className="px-4 py-3 flex items-center gap-3 text-sm">
            <MailX size={16} className={i.liberado ? 'text-gray-300' : 'text-red-500'} />
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 truncate">{i.email}{i.nome ? ` — ${i.nome}` : ''}</p>
              <p className="text-xs text-gray-500 truncate" title={i.motivo}>{i.codigo ? `${i.codigo} · ` : ''}{i.motivo}</p>
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">{horaBR(i.detectado_em)}</span>
            {i.liberado ? <span className="text-xs text-gray-400">liberado</span> : <button onClick={() => liberar(i.email)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Liberar</button>}
          </div>
        ))}
      </div>
    </div>
  )
}
