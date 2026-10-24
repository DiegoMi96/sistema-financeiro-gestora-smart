import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, PauseCircle, Trash2, RotateCcw, CheckCheck, Search, Mail, MessageCircle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { cobrancaApi } from '../../services/api'
import { Chip, EntregaChip, Modal, Confirmar, brl, dataBR, horaBR } from './ui'

const FILTROS = [
  ['pendente', 'Aguardando aprovação'], ['aprovado,enviando', 'Aprovados'], ['enviado', 'Enviados'],
  ['sem_contato', 'Sem e-mail'], ['devolvido', 'Devolvidos'], ['falhou', 'Falhas'], ['resolvido,cancelado,concluido', 'Resolvidos / removidos'],
]

export default function FilaTab({ resumo, onChange }) {
  const [status, setStatus] = useState('pendente')
  const [etapa, setEtapa] = useState('')
  const [canal, setCanal] = useState('')
  const [atualizando, setAtualizando] = useState(false)
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState({})
  const [previa, setPrevia] = useState(null)
  const [conf, setConf] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [pausar, setPausar] = useState(null)
  const [motivo, setMotivo] = useState('')

  const { data: et } = useQuery({ queryKey: ['cobranca-etapas'], queryFn: () => cobrancaApi.etapas().then(r => r.data), staleTime: 60000 })
  const nomes = Object.fromEntries((et?.etapas || []).map(e => [e.chave, e.nome]))
  const { data, isFetching } = useQuery({
    queryKey: ['cobranca-envios', status, etapa, canal, busca, page],
    queryFn: () => cobrancaApi.envios({ status, etapa: etapa || undefined, canal: canal || undefined, search: busca, page, limit: 50 }).then(r => r.data),
    staleTime: 0, placeholderData: prev => prev,
  })
  const itens = data?.itens || []
  const ids = Object.keys(sel).filter(k => sel[k]).map(Number)
  const pendentesPorEtapa = (resumo?.por_etapa || []).filter(x => x.status === 'pendente' && ['email', 'whatsapp'].includes(x.canal))
  const wa = resumo?.whatsapp

  const rodar = async (fn, ok) => {
    setOcupado(true)
    try { const r = await fn(); toast.success(ok(r.data)); setSel({}); setConf(null); onChange() }
    catch (e) { toast.error(e.response?.data?.detail || 'Não foi possível concluir') }
    finally { setOcupado(false) }
  }

  const textoEnvio = (qtd) => {
    const partes = []
    if (resumo?.modo_teste) partes.push(`Modo teste ligado: as mensagens vão para ${resumo.email_teste}, não para os clientes.`)
    else partes.push('As mensagens serão enviadas para os e-mails dos clientes.')
    return partes.join(' ')
  }
  const avisoEnvio = () => !resumo?.envio_ativo ? 'O envio está desligado (chave geral): os itens ficam aprovados, mas nada é enviado até alguém ligar.' : (!resumo?.smtp_configurado ? 'O e-mail não está configurado: nada será enviado.' : null)

  const aprovar = (body, qtd) => setConf({
    titulo: `Aprovar ${qtd} envio(s)`, texto: `${textoEnvio(qtd)}\n\nConfira a prévia antes. Depois de aprovado, o sistema reconfere se o boleto continua em aberto e descarta quem já pagou.`,
    aviso: avisoEnvio(), rotulo: 'Aprovar envio',
    ok: () => rodar(() => cobrancaApi.aprovar(body), d => `${d.aprovados} aprovado(s)`),
  })

  const abrirPrevia = async (id) => {
    try { setPrevia((await cobrancaApi.previaEnvio(id)).data) } catch { toast.error('Não foi possível abrir a prévia') }
  }

  const marcarTodos = e => setSel(e.target.checked ? Object.fromEntries(itens.filter(i => ['pendente', 'falhou', 'sem_contato', 'aprovado'].includes(i.status)).map(i => [i.id, true])) : {})

  return (
    <div className="p-5 space-y-4">
      {pendentesPorEtapa.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pendentesPorEtapa.map(p => (
            <button key={p.etapa + p.canal} onClick={() => aprovar({ etapa: p.etapa, canal: p.canal }, p.n)}
              className="text-xs px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-800 hover:bg-green-100 flex items-center gap-1.5">
              <CheckCheck size={13} /> Aprovar todos de “{nomes[p.etapa] || p.etapa}” {p.canal === 'whatsapp' ? '· WhatsApp ' : ''}({p.n})
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {FILTROS.map(([k, l]) => (
          <button key={k} onClick={() => { setStatus(k); setPage(1); setSel({}) }}
            className={`text-xs px-3 py-1.5 rounded-full border ${status === k ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{l}</button>
        ))}
        {wa?.configurado && (
          <button onClick={async () => { setAtualizando(true); try { const { data: d } = await cobrancaApi.atualizarEstados(); toast.success(`${d.entregas.atualizados} estado(s) atualizado(s), ${d.respostas.aceitaram + d.respostas.recusaram + d.respostas.outras} resposta(s) lida(s)`); onChange() } catch { toast.error('Erro ao consultar a Umbler') } finally { setAtualizando(false) } }}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5 ml-auto"><RefreshCw size={12} className={atualizando ? 'animate-spin' : ''} /> Atualizar estados do WhatsApp</button>
        )}
        <select value={canal} onChange={e => { setCanal(e.target.value); setPage(1); setSel({}) }} className={`text-xs border border-gray-200 rounded-lg px-2 py-1.5 ${wa?.configurado ? '' : 'ml-auto'}`}>
          <option value="">E-mail e WhatsApp</option><option value="email">Só e-mail</option><option value="whatsapp">Só WhatsApp</option>
        </select>
        <select value={etapa} onChange={e => { setEtapa(e.target.value); setPage(1); setSel({}) }} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
          <option value="">Todas as etapas</option>
          {(et?.etapas || []).map(e => <option key={e.chave} value={e.chave}>{e.nome}</option>)}
        </select>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input value={busca} onChange={e => { setBusca(e.target.value); setPage(1); setSel({}) }} placeholder="Buscar cliente ou e-mail"
            className="text-xs border border-gray-200 rounded-lg pl-7 pr-2 py-1.5 w-52" />
        </div>
      </div>

      {ids.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs bg-gray-50 rounded-lg px-3 py-2">
          <span className="text-gray-600">{ids.length} selecionado(s)</span>
          {status === 'pendente' && <button onClick={() => aprovar({ ids }, ids.length)} className="px-3 py-1.5 rounded-lg bg-green-600 text-white">Aprovar selecionados</button>}
          {status === 'falhou' && <button onClick={() => setConf({ titulo: 'Reenviar', texto: 'Antes de reenviar, confirme que a mensagem NÃO saiu: para e-mail, olhe a caixa de enviados; para WhatsApp, a conversa na Umbler. Reenviar sem conferir pode duplicar a cobrança.', rotulo: 'Reenviar', ok: () => rodar(() => cobrancaApi.reenviar({ ids }), d => `${d.reenfileirados} reenfileirado(s)`) })} className="px-3 py-1.5 rounded-lg border border-gray-300 flex items-center gap-1"><RotateCcw size={12} /> Reenviar</button>}
          {['pendente', 'aprovado', 'sem_contato', 'falhou'].some(s => status.includes(s)) &&
            <button onClick={() => setConf({ titulo: 'Remover da fila', texto: `Remover ${ids.length} item(ns)? Eles não serão enviados.`, rotulo: 'Remover', perigo: true, ok: () => rodar(() => cobrancaApi.cancelar({ ids, motivo: 'removido pelo analista' }), d => `${d.cancelados} removido(s)`) })} className="px-3 py-1.5 rounded-lg border border-gray-300 flex items-center gap-1"><Trash2 size={12} /> Remover</button>}
        </div>
      )}

      <div className="overflow-x-auto border border-gray-100 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="w-8 px-3 py-2"><input type="checkbox" onChange={marcarTodos} checked={itens.length > 0 && itens.filter(i => ['pendente', 'falhou', 'sem_contato', 'aprovado'].includes(i.status)).every(i => sel[i.id]) && ids.length > 0} /></th>
              <th className="text-left px-3 py-2">Etapa</th><th className="text-left px-3 py-2">Cliente</th><th className="text-left px-3 py-2">Enviar para</th>
              <th className="text-left px-3 py-2">Vencimento</th><th className="text-right px-3 py-2">Valor</th><th className="text-left px-3 py-2">Situação</th><th className="w-24 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">{isFetching ? 'Carregando…' : 'Nada por aqui.'}</td></tr>}
            {itens.map(i => (
              <tr key={i.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                <td className="px-3 py-2"><input type="checkbox" checked={!!sel[i.id]} disabled={!['pendente', 'falhou', 'sem_contato', 'aprovado'].includes(i.status)} onChange={e => setSel(s => ({ ...s, [i.id]: e.target.checked }))} /></td>
                <td className="px-3 py-2 whitespace-nowrap"><span className="inline-flex items-center gap-1.5">{i.canal === 'whatsapp' ? <MessageCircle size={14} className="text-green-600" /> : i.canal === 'email' ? <Mail size={14} className="text-gray-400" /> : null}{nomes[i.etapa] || i.etapa}</span></td>
                <td className="px-3 py-2"><p className="truncate max-w-[240px] text-gray-800">{i.nome}</p><p className="text-xs text-gray-400">{i.id_smart} · {i.origem === 'itau' ? 'Itaú' : 'Asaas'}</p></td>
                <td className="px-3 py-2 text-gray-600"><p className="truncate max-w-[220px]">{i.canal === 'whatsapp' ? (i.telefone || <span className="text-red-600">sem telefone válido</span>) : (i.destino || <span className="text-red-600">sem e-mail válido</span>)}</p>{i.destino_efetivo && i.destino_efetivo !== i.destino ? <p className="text-xs text-amber-700 truncate max-w-[220px]">modo teste: enviado para {i.destino_efetivo}</p> : i.destino_origem && <p className="text-xs text-gray-400">do {i.destino_origem}</p>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{dataBR(i.vencimento)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{brl(i.valor)}</td>
                <td className="px-3 py-2"><Chip status={i.status} />{i.canal === 'whatsapp' && i.status === 'enviado' && <span className="ml-1"><EntregaChip entrega={i.entrega} erro={i.entrega_erro} /></span>}{i.entrega_erro && <p className="text-xs text-red-600 mt-0.5 max-w-[200px] truncate" title={i.entrega_erro}>{i.entrega_erro}</p>}{i.erro && <p className="text-xs text-gray-500 mt-0.5 max-w-[200px] truncate" title={i.erro}>{i.erro}</p>}{i.enviado_em && <p className="text-xs text-gray-400">{horaBR(i.enviado_em)}</p>}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1.5 justify-end text-gray-400">
                    {i.canal !== 'tarefa' && <button title="Ver mensagem" onClick={() => abrirPrevia(i.id)} className="hover:text-gray-800"><Eye size={15} /></button>}
                    {['pendente', 'sem_contato'].includes(i.status) && <button title="Pausar cliente na régua" onClick={() => { setPausar(i); setMotivo('') }} className="hover:text-gray-800"><PauseCircle size={15} /></button>}
                    {i.canal === 'tarefa' && i.status === 'pendente' && <button title="Marcar como feito" onClick={() => rodar(() => cobrancaApi.concluir({ ids: [i.id] }), () => 'Tarefa concluída')} className="hover:text-green-700"><CheckCheck size={15} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{data ? `${data.total} item(ns) · ${brl(data.valor)}` : ''}</span>
        {data && data.pages > 1 && (
          <span className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => { setPage(p => p - 1); setSel({}) }} className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40">‹</button>
            {page} / {data.pages}
            <button disabled={page >= data.pages} onClick={() => { setPage(p => p + 1); setSel({}) }} className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40">›</button>
          </span>
        )}
      </div>

      {previa && (
        <Modal titulo={previa.enviado ? 'Mensagem enviada' : 'Prévia da mensagem'} onClose={() => setPrevia(null)} largo>
          <p className="text-xs text-gray-500">Para: {previa.para}</p>
          <p className="text-sm font-medium text-gray-800 mt-1">{previa.assunto}</p>
          <pre className="mt-3 text-sm text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-3">{previa.corpo}</pre>
        </Modal>
      )}
      {conf && <Confirmar {...conf} ocupado={ocupado} onClose={() => setConf(null)} onOk={conf.ok} />}
      {pausar && (
        <Modal titulo={`Pausar ${pausar.nome}`} onClose={() => setPausar(null)}>
          <p className="text-sm text-gray-600">O cliente sai da régua e os itens pendentes dele são removidos. Você pode retomar na aba Pausas.</p>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (ex.: promessa de pagamento até 30/10)" className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-3" />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setPausar(null)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200">Cancelar</button>
            <button onClick={() => rodar(() => cobrancaApi.criarPausa({ id_smart: pausar.id_smart, motivo }), d => `Cliente pausado (${d.itens_cancelados} item(ns) removido(s))`).then(() => setPausar(null))} className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white">Pausar cliente</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
