import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { cobrancaApi } from '../../services/api'
import { Modal } from './ui'

const CANAIS = { email: 'E-mail', whatsapp: 'WhatsApp', tarefa: 'Tarefa interna' }
const prazo = d => (d < 0 ? `${-d} dia(s) antes do vencimento` : d === 0 ? 'no dia do vencimento' : `${d} dia(s) depois do vencimento`)

export default function ReguaTab({ admin }) {
  const qc = useQueryClient()
  const { data, isError } = useQuery({ queryKey: ['cobranca-etapas'], queryFn: () => cobrancaApi.etapas().then(r => r.data), staleTime: 0 })
  const [edit, setEdit] = useState(null)
  const salvar = async (chave, body, msg = 'Salvo') => {
    try { await cobrancaApi.salvarEtapa(chave, body); toast.success(msg); qc.invalidateQueries({ queryKey: ['cobranca-etapas'] }); return true }
    catch (e) { toast.error(e.response?.data?.detail || 'Erro ao salvar'); return false }
  }
  if (isError) return <div className="p-8 text-center text-sm text-red-500">Não foi possível carregar as etapas.</div>
  if (!data) return <div className="p-8 text-center text-sm text-gray-400">Carregando…</div>

  return (
    <div className="p-5 space-y-4">
      <p className="text-sm text-gray-600">
        Cada etapa roda por boleto em aberto. Quando o cliente paga, ele sai da régua na hora. {admin ? '' : 'Só gestor/admin edita as etapas.'}
      </p>
      <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
        {data.etapas.map(e => (
          <div key={e.chave} className="px-4 py-3 flex items-center gap-4 flex-wrap">
            <button disabled={!admin} onClick={() => salvar(e.chave, { ativa: !e.ativa }, e.ativa ? 'Etapa desligada' : 'Etapa ligada')}
              className={`w-9 h-5 rounded-full relative shrink-0 ${e.ativa ? 'bg-green-500' : 'bg-gray-300'} ${admin ? '' : 'opacity-60'}`} aria-label="Ligar ou desligar etapa">
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${e.ativa ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium text-gray-800">{e.nome}</p>
              <p className="text-xs text-gray-500">
                {e.chave === 'consentimento' ? 'Enviado uma vez por cliente, antes da 1ª mensagem por WhatsApp · o analista aprova'
                  : e.chave === 'lancamento' ? 'Disparado pela emissão do boleto · 1 e-mail por cliente com todos os boletos novos dele · o analista aprova'
                  : `${prazo(e.dias)} · ${e.canais.map(c => CANAIS[c]).join(' + ')}${e.canais.includes('email') ? (e.modo === 'automatico' ? ' · e-mail envia sozinho' : ' · o analista aprova') : ''}`}
                {e.anexa_boleto && ' · leva o boleto (PDF do Itaú / link do Asaas)'}
                {e.canais.includes('whatsapp') && e.chave !== 'consentimento' && (e.wa_template_id ? ` · template ${e.wa_template_id}` : ' · falta o template do WhatsApp')}
                {e.chave === 'consentimento' && !e.wa_template_id && ' · falta o template do WhatsApp'}
              </p>
            </div>
            {admin && e.chave !== 'consentimento' && e.chave !== 'lancamento' && e.canais.includes('email') && (
              <label className="text-xs text-gray-600 flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={e.canais.includes('whatsapp')} onChange={ev => salvar(e.chave, { canais: ev.target.checked ? ['email', 'whatsapp'] : ['email'] }, ev.target.checked ? 'WhatsApp ligado na etapa' : 'WhatsApp desligado na etapa')} />
                + WhatsApp
              </label>
            )}
            <button onClick={() => setEdit(e)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">{admin ? 'Editar' : 'Ver texto'}</button>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400">O e-mail é sempre obrigatório. As etapas que levam o boleto (Lançamento e Vencimento) só saem com o PDF do Itaú / link do Asaas. O WhatsApp é adicional e só vai para quem autorizou. O texto do WhatsApp é o do template aprovado na Umbler.</p>
      {edit && <EditorEtapa etapa={edit} campos={data.campos} camposWa={data.campos_whatsapp || []} admin={admin} onClose={() => setEdit(null)} onSave={async b => { if (await salvar(edit.chave, b)) setEdit(null) }} />}
    </div>
  )
}

const ALTURA_EMAIL = 1250
// E-mail mostrado em tamanho de computador (640 px) e reduzido para caber na coluna; rola na vertical.
function PreviaEmail({ html }) {
  const ref = useRef(null)
  const [largura, setLargura] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setLargura(el.clientWidth || 640)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const escala = Math.min(1, largura / 640)
  return (
    <div ref={ref} className="w-full border border-gray-200 rounded-lg bg-gray-100 overflow-y-auto overflow-x-hidden" style={{ height: 560 }}>
      <div style={{ height: ALTURA_EMAIL * escala, overflow: 'hidden' }}>
        <iframe title="Prévia do e-mail" sandbox="" srcDoc={html} style={{ width: 640, height: ALTURA_EMAIL, border: 0, transform: `scale(${escala})`, transformOrigin: 'top left' }} />
      </div>
    </div>
  )
}

function EditorEtapa({ etapa, campos, camposWa, admin, onClose, onSave }) {
  const [dias, setDias] = useState(etapa.dias)
  const [modo, setModo] = useState(etapa.modo)
  const [assunto, setAssunto] = useState(etapa.assunto)
  const [texto, setTexto] = useState(etapa.texto)
  const [previa, setPrevia] = useState(null)
  const [origem, setOrigem] = useState('asaas')   // só afeta a prévia: Asaas = link da fatura, Itaú = PDF anexado
  const [waId, setWaId] = useState(etapa.wa_template_id || '')
  const [waParams, setWaParams] = useState(etapa.wa_params || [])
  const email = etapa.canais.includes('email')
  const whats = etapa.canais.includes('whatsapp')
  const alternar = c => setWaParams(p => (p.includes(c) ? p.filter(x => x !== c) : [...p, c]))

  useEffect(() => {
    if (!email) return
    const t = setTimeout(() => cobrancaApi.previaEtapa(etapa.chave, { assunto, texto, origem }).then(r => setPrevia(r.data)).catch(() => {}), 350)
    return () => clearTimeout(t)
  }, [assunto, texto, origem])  // eslint-disable-line react-hooks/exhaustive-deps

  const inserir = c => setTexto(t => `${t}{${c}}`)

  return (
    <Modal titulo={`Etapa: ${etapa.nome}`} onClose={onClose} largo>
      <div className={`grid grid-cols-2 gap-3 mb-4 ${['consentimento', 'lancamento'].includes(etapa.chave) ? 'hidden' : ''}`}>
        <label className="text-xs text-gray-500">Prazo (dias; negativo = antes do vencimento)
          <input type="number" value={dias} disabled={!admin} onChange={e => setDias(parseInt(e.target.value || '0', 10))} className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800" />
        </label>
        <label className="text-xs text-gray-500">Como envia
          <select value={modo} disabled={!admin} onChange={e => setModo(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800">
            <option value="aprovar">O analista aprova cada envio (recomendado)</option>
            <option value="automatico">Envia sozinho (só com a chave geral ligada)</option>
          </select>
        </label>
      </div>
      {email ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-gray-500">Assunto
              <input value={assunto} disabled={!admin} onChange={e => setAssunto(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800" />
            </label>
            <label className="text-xs text-gray-500">Mensagem
              <textarea rows={11} value={texto} disabled={!admin} onChange={e => setTexto(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800" />
            </label>
            {admin && <div className="flex flex-wrap gap-1.5">{campos.map(c => <button key={c} onClick={() => inserir(c)} className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">{`{${c}}`}</button>)}</div>}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-500">Prévia do e-mail{previa?.exemplo ? ` — ${previa.exemplo}` : ''}</p>
              {['lancamento', 'vence_hoje'].includes(etapa.chave) && (
                <div className="flex gap-1">
                  {[['asaas', 'Asaas (link)'], ['itau', 'Itaú (PDF)']].map(([v, t]) => (
                    <button key={v} onClick={() => setOrigem(v)} className={`text-xs px-2 py-0.5 rounded ${origem === v ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{t}</button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-sm font-medium text-gray-800 mb-2">Assunto: {previa?.assunto}</p>
            {previa?.html ? (
              <PreviaEmail html={previa.html} />
            ) : (
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <pre className="whitespace-pre-wrap font-sans text-gray-700">{previa?.corpo}</pre>
              </div>
            )}
          </div>
        </div>
      ) : etapa.chave === 'tarefa' ? <p className="text-sm text-gray-600">Esta etapa cria uma tarefa na fila para o analista ligar para o cliente. Não envia mensagem.</p> : null}
      {whats && (
        <div className={`${email ? 'mt-5 pt-4 border-t border-gray-100' : ''} space-y-3`}>
          <p className="text-sm font-semibold text-gray-800">WhatsApp (template da Umbler)</p>
          <label className="text-xs text-gray-500 block">ID do template aprovado
            <input value={waId} disabled={!admin} onChange={e => setWaId(e.target.value)} placeholder="copie da Umbler" className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800" />
          </label>
          <div>
            <p className="text-xs text-gray-500 mb-1">Campos enviados ao template, na ordem das variáveis ({'{{1}}'}, {'{{2}}'}…) — clique para incluir ou tirar</p>
            <div className="flex flex-wrap gap-1.5">
              {camposWa.map(c => <button key={c} disabled={!admin} onClick={() => alternar(c)} className={`text-xs px-2 py-1 rounded ${waParams.includes(c) ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{waParams.includes(c) ? `${waParams.indexOf(c) + 1}. ` : ''}{c}</button>)}
            </div>
            <p className="text-xs text-gray-400 mt-2">O texto e os botões ficam no template, aprovado pela Meta na Umbler. Aqui só dizemos qual template usar e quais valores entram em cada variável.</p>
          </div>
        </div>
      )}
      {admin && (
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200">Cancelar</button>
          <button onClick={() => { if (modo === 'automatico' && etapa.modo !== 'automatico' && !window.confirm('Esta etapa passará a ENVIAR SOZINHA, sem aprovação do analista (dentro da janela de envio e só com a chave geral ligada). Confirmar?')) return; onSave({ ...(['consentimento', 'lancamento'].includes(etapa.chave) ? (etapa.chave === 'lancamento' ? { modo } : {}) : { dias, modo }), ...(email ? { assunto, texto } : {}), ...(whats ? { wa_template_id: waId, wa_params: waParams } : {}) }) }} className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white">Salvar</button>
        </div>
      )}
    </Modal>
  )
}
