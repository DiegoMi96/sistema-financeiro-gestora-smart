import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { cobrancaApi } from '../../services/api'
import { Modal } from './ui'

const prazo = d => (d < 0 ? `${-d} dia(s) antes do vencimento` : d === 0 ? 'no dia do vencimento' : `${d} dia(s) depois do vencimento`)
const ORDEM_CANAIS = ['email', 'whatsapp', 'tarefa']

function Chave({ on, disabled, onClick, titulo }) {
  return (
    <button disabled={disabled} onClick={onClick} title={titulo} aria-label={titulo}
      className={`w-9 h-5 rounded-full relative shrink-0 ${on ? 'bg-green-500' : 'bg-gray-300'} ${disabled ? 'opacity-50' : ''}`}>
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

export default function ReguaTab({ admin }) {
  const qc = useQueryClient()
  const { data, isError } = useQuery({ queryKey: ['cobranca-etapas'], queryFn: () => cobrancaApi.etapas().then(r => r.data), staleTime: 0 })
  const [edit, setEdit] = useState(null)          // { etapa, aba }
  const [rodape, setRodape] = useState(false)
  const salvar = async (chave, body, msg = 'Salvo') => {
    try { await cobrancaApi.salvarEtapa(chave, body); toast.success(msg); qc.invalidateQueries({ queryKey: ['cobranca-etapas'] }); return true }
    catch (e) { toast.error(e.response?.data?.detail || 'Erro ao salvar'); return false }
  }
  if (isError) return <div className="p-8 text-center text-sm text-red-500">Não foi possível carregar as etapas.</div>
  if (!data) return <div className="p-8 text-center text-sm text-gray-400">Carregando…</div>

  const alternarCanal = (e, canal) => {
    const tem = e.canais.includes(canal)
    if (tem && canal === 'email' && !window.confirm('Desligar o e-mail desta etapa? Ela passa a sair só por WhatsApp, e quem ainda não autorizou o WhatsApp não recebe nada nesta etapa.')) return
    const novo = ORDEM_CANAIS.filter(c => (c === canal ? !tem : e.canais.includes(c)))
    salvar(e.chave, { canais: novo }, `${canal === 'email' ? 'E-mail' : 'WhatsApp'} ${tem ? 'desligado' : 'ligado'} na etapa`)
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-600">
          Cada etapa roda por boleto em aberto. Quando o cliente paga, ele sai da régua na hora. Em cada etapa você liga o <b>E-mail</b> e/ou o <b>WhatsApp</b> e edita cada formato separadamente. {admin ? '' : 'Só gestor/admin edita as etapas.'}
        </p>
        <button onClick={() => setRodape(true)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 shrink-0">{admin ? 'Rodapé e contatos do e-mail' : 'Ver rodapé do e-mail'}</button>
      </div>
      <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
        {data.etapas.map(e => {
          const consent = e.chave === 'consentimento'
          const lanc = e.chave === 'lancamento'
          const tarefa = e.chave === 'tarefa'
          const temEmail = e.canais.includes('email')
          const temWa = e.canais.includes('whatsapp')
          return (
            <div key={e.chave} className="px-4 py-3 flex items-center gap-4 flex-wrap">
              <Chave on={e.ativa} disabled={!admin} titulo="Ligar ou desligar etapa" onClick={() => salvar(e.chave, { ativa: !e.ativa }, e.ativa ? 'Etapa desligada' : 'Etapa ligada')} />
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-medium text-gray-800">{e.nome}</p>
                <p className="text-xs text-gray-500">
                  {consent ? 'Enviado uma vez por cliente, antes da 1ª mensagem por WhatsApp · o analista aprova · texto padrão'
                    : lanc ? 'Disparado pela emissão do boleto · 1 e-mail por cliente com todos os boletos novos dele · o analista aprova'
                    : tarefa ? `${prazo(e.dias)} · Tarefa interna`
                    : `${prazo(e.dias)}${e.modo === 'automatico' ? ' · envia sozinho' : ' · o analista aprova'}`}
                  {e.anexa_boleto && ' · leva o boleto (PDF do Itaú / link do Asaas)'}
                  {temWa && !consent && (e.wa_template_id ? ` · template ${e.wa_template_id}` : ' · falta o template do WhatsApp')}
                  {consent && !e.wa_template_id && ' · falta o template do WhatsApp'}
                  {!temEmail && !tarefa && !consent && ' · e-mail desligado: só WhatsApp'}
                </p>
              </div>
              {tarefa && <button onClick={() => setEdit({ etapa: e, aba: 'geral' })} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">{admin ? 'Editar' : 'Ver'}</button>}
              {!tarefa && !consent && (
                <div className="flex items-center gap-2 border border-gray-100 rounded-lg px-2.5 py-1.5">
                  <Chave on={temEmail} disabled={!admin} titulo="Enviar por e-mail" onClick={() => alternarCanal(e, 'email')} />
                  <button onClick={() => setEdit({ etapa: e, aba: 'email' })} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">E-mail · {admin ? 'Editar' : 'Ver'}</button>
                </div>
              )}
              {!tarefa && (
                <div className="flex items-center gap-2 border border-gray-100 rounded-lg px-2.5 py-1.5">
                  {!consent && <Chave on={temWa} disabled={!admin || lanc} titulo={lanc ? 'O WhatsApp do aviso de lançamento ainda não existe' : 'Enviar por WhatsApp'} onClick={() => alternarCanal(e, 'whatsapp')} />}
                  {lanc
                    ? <span className="text-xs text-gray-400">WhatsApp · em breve</span>
                    : <button onClick={() => setEdit({ etapa: e, aba: 'whatsapp' })} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">WhatsApp · {admin ? 'Editar' : 'Ver'}</button>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-400">As etapas que levam o boleto (Lançamento e Vencimento) só saem com o PDF do Itaú / link do Asaas. O WhatsApp só vai para quem autorizou, e o texto dele é o do template aprovado na Umbler. O pedido de autorização é padrão e não muda.</p>
      {edit && <EditorEtapa etapa={edit.etapa} aba={edit.aba} campos={data.campos} camposWa={data.campos_whatsapp || []} admin={admin} onClose={() => setEdit(null)} onSave={async b => { if (await salvar(edit.etapa.chave, b)) setEdit(null) }} />}
      {rodape && <EditorRodape admin={admin} onClose={() => setRodape(false)} />}
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

const CAMPOS_LAYOUT = [
  ['titulo', 'Título grande do e-mail (faixa cinza)', 'igual ao assunto'],
  ['preheader', 'Texto de pré-visualização (aparece na caixa de entrada, antes de abrir)', 'as primeiras palavras da mensagem'],
  ['secao_titulo', 'Título do bloco de dados', 'Dados do boleto'],
  ['secao_sub', 'Subtítulo do bloco de dados', 'Confira as informações e a forma de pagamento:'],
  ['card_valor', 'Texto do cartão de valor', 'Boleto bancário · competência {competencia}'],
  ['card_venc', 'Texto do cartão de vencimento', 'Data de vencimento'],
]
const EXEMPLO_WA = { nome: 'Cliente Exemplo LTDA', valor: 'R$ 1.240,50', vencimento: '03/11/2026', competencia: 'outubro/2026', link: 'https://www.asaas.com/i/exemplo', dias_atraso: '3', data_limite: '06/11/2026' }

function EditorEtapa({ etapa, aba, campos, camposWa, admin, onClose, onSave }) {
  const [dias, setDias] = useState(etapa.dias)
  const [modo, setModo] = useState(etapa.modo)
  const [assunto, setAssunto] = useState(etapa.assunto)
  const [texto, setTexto] = useState(etapa.texto)
  const [layout, setLayout] = useState(etapa.layout || {})
  const [previa, setPrevia] = useState(null)
  const [origem, setOrigem] = useState('asaas')   // só afeta a prévia: Asaas = link da fatura, Itaú = PDF anexado
  const [waId, setWaId] = useState(etapa.wa_template_id || '')
  const [waParams, setWaParams] = useState(etapa.wa_params || [])
  const [waTexto, setWaTexto] = useState(etapa.wa_texto || '')
  const [verLayout, setVerLayout] = useState(false)
  const email = aba === 'email'
  const whats = aba === 'whatsapp'
  const alternar = c => setWaParams(p => (p.includes(c) ? p.filter(x => x !== c) : [...p, c]))
  const fixo = ['consentimento', 'lancamento'].includes(etapa.chave)

  useEffect(() => {
    if (!email) return
    const t = setTimeout(() => cobrancaApi.previaEtapa(etapa.chave, { assunto, texto, origem, layout }).then(r => setPrevia(r.data)).catch(() => {}), 350)
    return () => clearTimeout(t)
  }, [assunto, texto, origem, layout])  // eslint-disable-line react-hooks/exhaustive-deps

  const inserir = c => setTexto(t => `${t}{${c}}`)
  const titulo = `${etapa.nome} — ${email ? 'E-mail' : whats ? 'WhatsApp' : 'configuração'}`
  const balao = waParams.reduce((t, c, i) => t.split(`{{${i + 1}}}`).join(EXEMPLO_WA[c] || c), waTexto)

  const salvar = () => {
    if (modo === 'automatico' && etapa.modo !== 'automatico' && !window.confirm('Esta etapa passará a ENVIAR SOZINHA, sem aprovação do analista (dentro da janela de envio e só com a chave geral ligada). Confirmar?')) return
    onSave({
      ...(etapa.chave === 'consentimento' ? {} : etapa.chave === 'lancamento' ? { modo } : { dias, modo }),
      ...(email ? { assunto, texto, layout } : {}),
      ...(whats ? { wa_template_id: waId, wa_params: waParams, wa_texto: waTexto } : {}),
    })
  }

  return (
    <Modal titulo={titulo} onClose={onClose} largo>
      <div className={`grid grid-cols-2 gap-3 mb-4 ${fixo ? 'hidden' : ''}`}>
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
      {email && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-gray-500 block">Assunto do e-mail
              <input value={assunto} disabled={!admin} onChange={e => setAssunto(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800" />
            </label>
            <label className="text-xs text-gray-500 block">Mensagem
              <textarea rows={9} value={texto} disabled={!admin} onChange={e => setTexto(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800" />
            </label>
            {admin && <div className="flex flex-wrap gap-1.5">{campos.map(c => <button key={c} onClick={() => inserir(c)} className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">{`{${c}}`}</button>)}</div>}
            <button onClick={() => setVerLayout(v => !v)} className="text-xs text-green-700 font-medium pt-1">{verLayout ? '▾' : '▸'} Textos do layout do e-mail (título, bloco de dados, cartões)</button>
            {verLayout && (
              <div className="space-y-2 border border-gray-100 rounded-lg p-3 bg-gray-50">
                {CAMPOS_LAYOUT.map(([k, rotulo, padrao]) => (
                  <label key={k} className="text-xs text-gray-500 block">{rotulo}
                    <input value={layout[k] || ''} disabled={!admin} placeholder={padrao} onChange={e => setLayout(l => ({ ...l, [k]: e.target.value }))} className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800 bg-white" />
                  </label>
                ))}
                <p className="text-xs text-gray-400">Deixe em branco para usar o texto padrão. Aceita os mesmos campos da mensagem, como {'{nome}'} e {'{competencia}'}. O rodapé e os contatos são os mesmos em todas as etapas: use o botão “Rodapé e contatos do e-mail” da lista.</p>
              </div>
            )}
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
            {previa?.html ? <PreviaEmail html={previa.html} /> : (
              <div className="bg-gray-50 rounded-lg p-3 text-sm"><pre className="whitespace-pre-wrap font-sans text-gray-700">{previa?.corpo}</pre></div>
            )}
          </div>
        </div>
      )}
      {aba === 'geral' && <p className="text-sm text-gray-600">Esta etapa cria uma tarefa na fila para o analista ligar para o cliente. Não envia mensagem.</p>}
      {whats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="text-xs text-gray-500 block">ID do template aprovado (Umbler)
              <input value={waId} disabled={!admin} onChange={e => setWaId(e.target.value)} placeholder="copie da Umbler" className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800" />
            </label>
            <div>
              <p className="text-xs text-gray-500 mb-1">Campos enviados ao template, na ordem das variáveis ({'{{1}}'}, {'{{2}}'}…) — clique para incluir ou tirar</p>
              <div className="flex flex-wrap gap-1.5">
                {camposWa.map(c => <button key={c} disabled={!admin} onClick={() => alternar(c)} className={`text-xs px-2 py-1 rounded ${waParams.includes(c) ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{waParams.includes(c) ? `${waParams.indexOf(c) + 1}. ` : ''}{c}</button>)}
              </div>
            </div>
            <label className="text-xs text-gray-500 block">Texto do template (cópia, só para você visualizar)
              <textarea rows={7} value={waTexto} disabled={!admin} onChange={e => setWaTexto(e.target.value)} placeholder="Cole aqui o texto aprovado na Umbler, com {{1}}, {{2}}…" className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800" />
            </label>
            <p className="text-xs text-gray-400">O que o cliente recebe é o texto aprovado pela Meta na Umbler. Para mudar a mensagem, edite o template lá e cole o novo ID e o novo texto aqui. Esta cópia só alimenta a prévia ao lado.</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Prévia da mensagem (cliente fictício)</p>
            <div className="rounded-xl p-3" style={{ background: '#e7ded4' }}>
              {balao
                ? <div className="max-w-[320px] rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm text-gray-800 shadow-sm whitespace-pre-wrap">{balao}</div>
                : <p className="text-xs text-gray-500">Cole o texto do template ao lado para ver a prévia.</p>}
            </div>
          </div>
        </div>
      )}
      {admin && (
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200">Cancelar</button>
          <button onClick={salvar} className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white">Salvar</button>
        </div>
      )}
    </Modal>
  )
}

const CAMPOS_RODAPE = [
  ['duvida_titulo', 'Título do bloco de dúvidas'],
  ['duvida_texto', 'Texto do bloco de dúvidas', true],
  ['contato_email', 'E-mail de contato'],
  ['contato_fone', 'Telefone de contato'],
  ['redes_texto', 'Chamada das redes sociais'],
  ['url_instagram', 'Link do Instagram (https://… — vazio esconde o ícone)'],
  ['url_linkedin', 'Link do LinkedIn (https://… — vazio esconde o ícone)'],
  ['rodape_email', 'E-mail do rodapé (também recebe os pedidos de descadastro)'],
  ['rodape_endereco', 'Endereço'],
  ['rodape_copyright', 'Linha de direitos (use {ano} para o ano atual)'],
  ['rodape_descadastro', 'Texto do link de descadastro'],
  ['rodape_slogan', 'Slogan (separe os itens com |)'],
]

function EditorRodape({ admin, onClose }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['cobranca-layout-global'], queryFn: () => cobrancaApi.layoutGlobal().then(r => r.data), staleTime: 0 })
  const [g, setG] = useState(null)
  const [previa, setPrevia] = useState(null)
  useEffect(() => { if (data && !g) setG(data.layout) }, [data])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!g) return
    const t = setTimeout(() => cobrancaApi.previaEtapa('vence_hoje', { assunto: 'Exemplo', texto: 'Olá, {nome}.\n\n{link}', origem: 'asaas', layout_global: g }).then(r => setPrevia(r.data)).catch(() => {}), 400)
    return () => clearTimeout(t)
  }, [g])
  const salvar = async () => {
    try { await cobrancaApi.salvarLayoutGlobal({ layout: g }); toast.success('Rodapé e contatos salvos'); qc.invalidateQueries({ queryKey: ['cobranca-layout-global'] }); onClose() }
    catch (e) { toast.error(e.response?.data?.detail || 'Erro ao salvar') }
  }
  return (
    <Modal titulo="Rodapé e contatos do e-mail (valem para todas as etapas)" onClose={onClose} largo>
      {!g ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
            {CAMPOS_RODAPE.map(([k, rotulo, longo]) => (
              <label key={k} className="text-xs text-gray-500 block">{rotulo}
                {longo
                  ? <textarea rows={3} value={g[k] || ''} disabled={!admin} onChange={e => setG(x => ({ ...x, [k]: e.target.value }))} className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800" />
                  : <input value={g[k] || ''} disabled={!admin} onChange={e => setG(x => ({ ...x, [k]: e.target.value }))} className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800" />}
              </label>
            ))}
            <p className="text-xs text-gray-400">O link “Não quero mais receber estes e-mails” só abre um e-mail para o endereço do rodapé: o descadastro é tratado por uma pessoa.</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Prévia (role até o final do e-mail)</p>
            {previa?.html ? <PreviaEmail html={previa.html} /> : <p className="text-xs text-gray-400">Carregando prévia…</p>}
          </div>
        </div>
      )}
      {admin && (
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200">Cancelar</button>
          <button onClick={salvar} disabled={!g} className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white">Salvar</button>
        </div>
      )}
    </Modal>
  )
}
