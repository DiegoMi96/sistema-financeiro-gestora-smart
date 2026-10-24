import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { cobrancaApi } from '../../services/api'
import { horaBR } from './ui'

const ST = {
  aceitou:         { rotulo: 'Autorizou', cls: 'bg-green-50 text-green-700' },
  pedido_enviado:  { rotulo: 'Aguardando resposta', cls: 'bg-amber-50 text-amber-800' },
  respondeu_outro: { rotulo: 'Respondeu outra coisa', cls: 'bg-blue-50 text-blue-700' },
  recusou:         { rotulo: 'Não quer WhatsApp', cls: 'bg-gray-100 text-gray-600' },
  sem_whatsapp:    { rotulo: 'Número sem WhatsApp', cls: 'bg-red-50 text-red-700' },
}
const FILTROS = [['', 'Todos'], ['respondeu_outro', 'Precisam de decisão'], ['pedido_enviado', 'Aguardando'], ['aceitou', 'Autorizaram'], ['recusou', 'Recusaram'], ['sem_whatsapp', 'Sem WhatsApp']]

export default function WhatsAppTab({ resumo }) {
  const qc = useQueryClient()
  const [st, setSt] = useState('')
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(1)
  const { data } = useQuery({
    queryKey: ['cobranca-autorizacoes', st, busca, page],
    queryFn: () => cobrancaApi.autorizacoes({ status: st || undefined, search: busca, page, limit: 50 }).then(r => r.data),
    staleTime: 0, placeholderData: prev => prev,
  })
  const wa = resumo?.whatsapp
  const c = wa?.consent || {}
  const decidir = async (id, status) => {
    let motivo = ''
    if (status === 'aceitou') {
      motivo = (window.prompt('Como e quando o cliente autorizou? (ex.: respondeu por e-mail em 24/10) — fica registrado na auditoria') || '').trim()
      if (motivo.length < 5) { toast.error('Informe como e quando o cliente autorizou.'); return }
    }
    try { await cobrancaApi.decidirAutorizacao(id, status, motivo); toast.success(status === 'aceitou' ? 'Marcado como autorizado' : 'Marcado como não quer WhatsApp'); qc.invalidateQueries({ queryKey: ['cobranca-autorizacoes'] }); qc.invalidateQueries({ queryKey: ['cobranca-resumo'] }) }
    catch (e) { toast.error(e.response?.data?.detail || 'Erro ao salvar') }
  }
  const Card = ({ rotulo, v, cls = '' }) => <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">{rotulo}</p><p className={`text-xl font-semibold mt-0.5 ${cls}`}>{v ?? 0}</p></div>

  return (
    <div className="p-5 space-y-4">
      <p className="text-sm text-gray-600 max-w-3xl">
        Antes da primeira cobrança por WhatsApp, o cliente recebe um pedido de autorização (uma vez só). Quem responde <b>SIM</b> passa a receber também por WhatsApp.
        Quem responde <b>NÃO</b> ou <b>SAIR</b>, não responde ou não tem WhatsApp continua recebendo <b>só por e-mail</b>, que é sempre obrigatório.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card rotulo="Autorizaram" v={c.aceitou} cls="text-green-600" />
        <Card rotulo="Aguardando resposta" v={c.pedido_enviado} cls="text-amber-600" />
        <Card rotulo="Precisam de decisão" v={c.respondeu_outro} cls="text-blue-600" />
        <Card rotulo="Recusaram" v={c.recusou} />
        <Card rotulo="Sem WhatsApp" v={c.sem_whatsapp} />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {FILTROS.map(([k, l]) => <button key={k} onClick={() => { setSt(k); setPage(1) }} className={`text-xs px-3 py-1.5 rounded-full border ${st === k ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{l}</button>)}
        <div className="relative ml-auto"><Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input value={busca} onChange={e => { setBusca(e.target.value); setPage(1) }} placeholder="Buscar cliente" className="text-xs border border-gray-200 rounded-lg pl-7 pr-2 py-1.5 w-52" /></div>
      </div>
      <div className="overflow-x-auto border border-gray-100 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="text-left px-3 py-2">Cliente</th><th className="text-left px-3 py-2">Telefone</th><th className="text-left px-3 py-2">Situação</th><th className="text-left px-3 py-2">Resposta do cliente</th><th className="w-44" /></tr></thead>
          <tbody>
            {(data?.itens || []).length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-gray-400">Nenhum cliente nesta lista ainda. Os pedidos de autorização aparecem aqui depois de enviados.</td></tr>}
            {(data?.itens || []).map(a => {
              const s = ST[a.status] || { rotulo: a.status, cls: 'bg-gray-100 text-gray-600' }
              return (
                <tr key={a.id_smart} className="border-t border-gray-100">
                  <td className="px-3 py-2"><p className="text-gray-800 truncate max-w-[240px]">{a.nome}</p><p className="text-xs text-gray-400">{a.id_smart}</p></td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{a.telefone || '—'}</td>
                  <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}>{s.rotulo}</span>{a.origem === 'manual' && <p className="text-xs text-gray-400 mt-0.5">marcado pelo analista</p>}</td>
                  <td className="px-3 py-2 text-gray-600"><p className="truncate max-w-[260px]" title={a.resposta_texto}>{a.resposta_texto || '—'}</p>{a.respondido_em && <p className="text-xs text-gray-400">{horaBR(a.respondido_em)}</p>}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5 justify-end">
                      {a.status !== 'aceitou' && <button onClick={() => decidir(a.id_smart, 'aceitou')} className="text-xs px-2 py-1 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 flex items-center gap-1"><Check size={12} /> Autorizou</button>}
                      {a.status !== 'recusou' && <button onClick={() => decidir(a.id_smart, 'recusou')} className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1"><X size={12} /> Não quer</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {data && data.pages > 1 && (
        <div className="flex justify-end items-center gap-2 text-xs text-gray-500">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40">‹</button>{page} / {data.pages}
          <button disabled={page >= data.pages} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40">›</button>
        </div>
      )}
    </div>
  )
}
