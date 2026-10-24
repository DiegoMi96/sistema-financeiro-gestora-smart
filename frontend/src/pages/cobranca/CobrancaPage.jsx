import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, RefreshCw, ShieldAlert, FlaskConical, Power, Clock, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { cobrancaApi } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import FilaTab from './FilaTab'
import ReguaTab from './ReguaTab'
import PausasTab from './PausasTab'
import DevolvidosTab from './DevolvidosTab'
import BoletosItauTab from './BoletosItauTab'
import WhatsAppTab from './WhatsAppTab'
import ConfigTab from './ConfigTab'

const quando = iso => {
  if (!iso) return 'nunca'
  const h = (Date.now() - new Date(iso).getTime()) / 36e5
  if (h < 1) return `há ${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `há ${Math.round(h)} h`
  return new Date(iso).toLocaleDateString('pt-BR')
}

// Régua de cobrança: o analista confere e aprova a fila; nada é enviado sem aprovação e sem a chave geral ligada.
export default function CobrancaPage() {
  const { can } = useAuth()
  const admin = can('can_approve_billing')
  const qc = useQueryClient()
  const [tab, setTab] = useState('fila')
  const [gerando, setGerando] = useState(false)

  const { data: r } = useQuery({ queryKey: ['cobranca-resumo'], queryFn: () => cobrancaApi.resumo().then(x => x.data), staleTime: 0, refetchInterval: 30000 })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['cobranca-resumo'] }); qc.invalidateQueries({ queryKey: ['cobranca-envios'] }) }

  const gerar = async () => {
    setGerando(true)
    try {
      const { data } = await cobrancaApi.gerar()
      toast.success(data.total_criados ? `${data.total_criados} novo(s) item(ns) na fila` : 'Fila já está atualizada')
      if (!data.frescor.asaas_ok) toast.error('Dados do Asaas desatualizados: boletos do Asaas não entraram na fila')
      if (!data.frescor.itau_ok) toast.error('Planilha do Itaú desatualizada: boletos do Itaú não entraram na fila')
      refresh()
    } catch (e) { toast.error(e.response?.data?.detail || 'Erro ao atualizar a fila') }
    finally { setGerando(false) }
  }

  const tabs = [['fila', 'Fila de envios'], ['regua', 'Régua'], ['boletos', 'Boletos Itaú'], ['whatsapp', 'WhatsApp'], ['devolvidos', 'E-mails devolvidos'], ['pausas', 'Pausas'], ...(admin ? [['config', 'Configuração']] : [])]
  const pend = r?.contagem?.pendente || 0

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="gs-page-title">Cobrança</h1>
          <p className="gs-page-sub">Régua de cobrança por e-mail e WhatsApp · você aprova, o sistema envia</p>
        </div>
        <button onClick={gerar} disabled={gerando} className="gs-btn gs-btn-outline flex items-center gap-2">
          <RefreshCw size={14} className={gerando ? 'animate-spin' : ''} /> Atualizar fila
        </button>
      </div>

      {r && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${r.envio_ativo ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            <Power size={12} /> Envio {r.envio_ativo ? 'ligado' : 'desligado'}
          </span>
          {r.modo_teste && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800">
              <FlaskConical size={12} /> Modo teste: tudo vai para {r.email_teste}
            </span>
          )}
          {!r.smtp_configurado && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700"><ShieldAlert size={12} /> E-mail não configurado</span>}
          {r.whatsapp?.pausado_motivo && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700"><ShieldAlert size={12} /> WhatsApp pausado: {r.whatsapp.pausado_motivo}</span>
          )}
          {r.whatsapp?.configurado && !r.whatsapp.pausado_motivo && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${r.whatsapp.ativo ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
              <MessageCircle size={12} /> WhatsApp {r.whatsapp.ativo ? 'ligado' : 'desligado'} · hoje {r.whatsapp.enviados_hoje}/{r.whatsapp.limite_diario}{r.whatsapp.canal_estado ? ` · canal: ${r.whatsapp.canal_estado}` : ''}
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${r.horario?.agora_dentro ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-800'}`}>
            <Clock size={12} /> Envia das {r.horario?.inicio} às {r.horario?.fim}, só em dias úteis (sem fim de semana e feriados){r.horario?.agora_dentro ? '' : ` — agora não envia; próxima janela: ${r.horario?.proximo_envio}`}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600"><Send size={12} /> E-mails hoje: {r.enviados_hoje}/{r.limite_diario}</span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${r.frescor.asaas_ok ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-700'}`}>
            <Clock size={12} /> Asaas {quando(r.frescor.asaas_em)}{!r.frescor.asaas_ok && ' — desatualizado'}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${r.frescor.itau_ok ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-700'}`}>
            <Clock size={12} /> Planilha Itaú {quando(r.frescor.itau_em)}{!r.frescor.itau_ok && ' — desatualizada'}
          </span>
        </div>
      )}

      <div className="gs-card overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium border-b-2 whitespace-nowrap ${tab === k ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              {l}
              {k === 'fila' && pend > 0 && <span className="ml-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">{pend}</span>}
              {k === 'boletos' && (r?.contagem?.sem_boleto || 0) > 0 && <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">{r.contagem.sem_boleto}</span>}
            </button>
          ))}
        </div>
        {tab === 'fila' && <FilaTab resumo={r} onChange={refresh} />}
        {tab === 'regua' && <ReguaTab admin={admin} />}
        {tab === 'boletos' && <BoletosItauTab onChange={refresh} />}
        {tab === 'whatsapp' && <WhatsAppTab resumo={r} />}
        {tab === 'devolvidos' && <DevolvidosTab onChange={refresh} />}
        {tab === 'pausas' && <PausasTab onChange={refresh} />}
        {tab === 'config' && admin && <ConfigTab onChange={refresh} />}
      </div>
    </div>
  )
}
