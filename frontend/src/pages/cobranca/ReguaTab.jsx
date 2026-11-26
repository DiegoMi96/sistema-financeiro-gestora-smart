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
// Campos de várias linhas na edição direta (Enter quebra linha); nos outros, Enter conclui.
const MULTILINHA = new Set(['texto', 'duvida_texto'])
const CSS_EDICAO = `
[data-campo]{cursor:text;border-radius:3px}
[data-campo]:hover{outline:1px dashed #22a447;outline-offset:3px}
[data-campo]:focus{outline:2px solid #22a447;outline-offset:3px;background:rgba(240,253,244,.92);color:#111827}
[data-campo="texto"]:focus,[data-campo="duvida_texto"]:focus{white-space:pre-wrap;display:block}
a [data-campo]:focus{color:#111827}`

// E-mail mostrado em tamanho de computador (640 px) e reduzido para caber na coluna; rola na vertical.
// Com `editor`, cada texto marcado pelo servidor (data-campo) vira editável: clicou, aparece o texto "cru"
// (com {competencia}, {nome}…), digita, e ao sair a prévia é refeita com os dados do exemplo.
function PreviaEmail({ html, editor }) {
  const ref = useRef(null)
  const frame = useRef(null)
  const ed = useRef(editor)
  ed.current = editor
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

  const ligar = () => {
    const doc = frame.current?.contentDocument
    if (!doc || !ed.current) return
    const st = doc.createElement('style')
    st.textContent = CSS_EDICAO
    doc.head.appendChild(st)
    doc.addEventListener('click', ev => { if (ev.target.closest && ev.target.closest('a')) ev.preventDefault() }, true)   // links não navegam dentro da prévia
    const grupos = {}
    doc.querySelectorAll('[data-campo]').forEach(el => { (grupos[el.dataset.campo] = grupos[el.dataset.campo] || []).push(el) })
    Object.entries(grupos).forEach(([k, [prim, ...resto]]) => {
      if (!ed.current.editavel(k)) return
      try { prim.contentEditable = 'plaintext-only' } catch { prim.contentEditable = 'true' }
      if (prim.contentEditable !== 'plaintext-only') prim.contentEditable = 'true'
      prim.spellcheck = true
      prim.title = 'Clique para editar'
      resto.forEach(el => {                                  // ex.: 2ª linha do título → edita junto com a 1ª
        el.style.cursor = 'text'
        el.addEventListener('mousedown', ev => { ev.preventDefault(); prim.focus() })
      })
      let original = null, inicial = null                    // para desfazer a troca visual se sair sem mudar nada
      prim.addEventListener('focus', () => {
        original = prim.innerHTML
        inicial = ed.current.bruto(k)
        resto.forEach(el => { el.style.display = 'none' })
        prim.innerText = inicial
        const sel = doc.getSelection(); const r = doc.createRange()
        r.selectNodeContents(prim); r.collapse(false); sel.removeAllRanges(); sel.addRange(r)
        ed.current.foco(k)
      })
      prim.addEventListener('input', () => {
        let v = prim.innerText.replace(/ /g, ' ')
        v = MULTILINHA.has(k) ? v.replace(/\n+$/, '') : v.replace(/\s*\n\s*/g, ' ').trim()
        ed.current.editar(k, v)
      })
      prim.addEventListener('keydown', ev => {
        if (ev.key === 'Escape' || (ev.key === 'Enter' && !MULTILINHA.has(k))) { ev.preventDefault(); prim.blur() }
      })
      prim.addEventListener('paste', ev => {                 // cola só texto (sem formatação de Word/site)
        ev.preventDefault()
        doc.execCommand('insertText', false, (ev.clipboardData?.getData('text/plain') || ''))
      })
      prim.addEventListener('blur', () => {
        if (original !== null && ed.current.bruto(k) === inicial) {           // nada mudou: volta a mostrar como estava (com o mês, cores etc.)
          prim.innerHTML = original
          resto.forEach(el => { el.style.display = '' })
        }
        original = null
        ed.current.foco(null)
      })
    })
  }

  return (
    <div ref={ref} className="w-full border border-gray-200 rounded-lg bg-gray-100 overflow-y-auto overflow-x-hidden" style={{ height: 600 }}>
      <div style={{ height: ALTURA_EMAIL * escala, overflow: 'hidden' }}>
        <iframe ref={frame} title="Prévia do e-mail" sandbox={editor ? 'allow-same-origin' : ''} srcDoc={html} onLoad={ligar}
          style={{ width: 640, height: ALTURA_EMAIL, border: 0, transform: `scale(${escala})`, transformOrigin: 'top left' }} />
      </div>
    </div>
  )
}

// Campos do e-mail por seção, na ordem em que aparecem. [chave, rótulo, padrão (o que sai se ficar em branco), várias linhas?]
// O lançamento do ciclo usa uma tabela (vencimento/valor/botão); as outras etapas usam cartões.
const BLOCO_LANCAMENTO = [
  ['secao_titulo', 'Título do bloco', 'Sua fatura'],
  ['secao_sub', 'Subtítulo', 'Consulte os dados da cobrança e a data de vencimento:'],
  ['rotulo_venc', 'Nome da coluna de vencimento', 'Vencimento'],
  ['rotulo_valor', 'Nome da coluna de valor', 'Valor'],
  ['botao_fatura', 'Texto do botão da fatura (Asaas)', 'Ver fatura'],
]
const BLOCO_ETAPAS = [
  ['secao_titulo', 'Título do bloco', 'Dados do boleto'],
  ['secao_sub', 'Subtítulo', 'Confira as informações e a forma de pagamento:'],
  ['card_valor', 'Texto do cartão de valor', 'Boleto bancário · competência {competencia}'],
  ['card_venc', 'Texto do cartão de vencimento', 'Data de vencimento'],
  ['botao_fatura', 'Texto do botão da fatura (Asaas)', 'Ver fatura'],
]
const BLOCO_TABELA = [   // etapas com a tabela igual à do lançamento (Vencimento | Valor | botão)
  ['secao_titulo', 'Título do bloco', 'Dados do boleto'],
  ['secao_sub', 'Subtítulo', 'Confira as informações e a forma de pagamento:'],
  ['rotulo_venc', 'Nome da coluna de vencimento', 'Vencimento'],
  ['rotulo_valor', 'Nome da coluna de valor', 'Valor'],
  ['botao_fatura', 'Texto do botão da fatura (Asaas)', 'Ver fatura'],
]
const ETAPAS_TABELA = ['vence_hoje']
const GLOBAL_DUVIDAS = [
  ['duvida_titulo', 'Título'],
  ['duvida_texto', 'Texto', true],
  ['contato_email', 'E-mail de contato'],
  ['contato_fone', 'Telefone de contato'],
]
const GLOBAL_RODAPE = [
  ['redes_texto', 'Chamada das redes sociais'],
  ['url_instagram', 'Link do Instagram (https://… — vazio esconde o ícone)'],
  ['url_linkedin', 'Link do LinkedIn (https://… — vazio esconde o ícone)'],
  ['rodape_email', 'E-mail do rodapé (também recebe os descadastros)'],
  ['rodape_endereco', 'Endereço'],
  ['rodape_copyright', 'Linha de direitos (use {ano} para o ano atual)'],
  ['rodape_descadastro', 'Texto do link de descadastro'],
  ['rodape_slogan', 'Slogan (separe os itens com |)'],
]
const CHAVES_GLOBAIS = new Set([...GLOBAL_DUVIDAS, ...GLOBAL_RODAPE].map(c => c[0]))

function Secao({ n, titulo, todas, children }) {
  return (
    <div className="border border-gray-100 rounded-lg p-3 space-y-2 bg-white">
      <p className="text-xs font-semibold text-gray-700 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-green-50 text-green-700 flex items-center justify-center text-[11px]">{n}</span>
        {titulo}
        {todas && <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">vale para todas as etapas</span>}
      </p>
      {children}
    </div>
  )
}

function Campo({ id, rotulo, ativo, padrao, valor, longo, disabled, onChange, onPadrao }) {
  const cls = `w-full border rounded-lg p-2 text-sm mt-1 text-gray-800 ${ativo ? 'border-green-500 ring-2 ring-green-100' : 'border-gray-200'}`
  return (
    <label id={`campo-${id}`} className="text-xs text-gray-500 block">
      <span className="flex items-center justify-between">
        {rotulo}
        {!disabled && onPadrao && <button type="button" onClick={onPadrao} className="text-[11px] text-gray-400 hover:text-green-700">↺ voltar ao padrão</button>}
      </span>
      {longo
        ? <textarea rows={longo === true ? 3 : longo} value={valor} placeholder={padrao} disabled={disabled} onChange={e => onChange(e.target.value)} className={cls} />
        : <input value={valor} placeholder={padrao} disabled={disabled} onChange={e => onChange(e.target.value)} className={cls} />}
    </label>
  )
}

const EXEMPLO_WA = { nome: 'Cliente Exemplo LTDA', valor: 'R$ 1.240,50', vencimento: '03/11/2026', competencia: 'outubro/2026', link: 'https://www.asaas.com/i/exemplo', dias_atraso: '3', data_limite: '06/11/2026' }

function EditorEtapa({ etapa, aba, campos, camposWa, admin, onClose, onSave }) {
  const [dias, setDias] = useState(etapa.dias)
  const [modo, setModo] = useState(etapa.modo)
  // um texto para os boletos do Asaas e outro para os do Itaú (o do Itaú começa como cópia do Asaas)
  const principal = { assunto: etapa.assunto, texto: etapa.texto, layout: etapa.layout || {} }
  const [versoes, setVersoes] = useState({ asaas: principal, itau: etapa.itau ? { ...etapa.itau, layout: etapa.itau.layout || {} } : principal })
  const [previa, setPrevia] = useState(null)
  const [origem, setOrigem] = useState('asaas')   // qual versão está sendo editada (e a prévia: link da fatura x PDF anexado)
  const { assunto, texto, layout } = versoes[origem]
  const mudaVersao = (k, v) => setVersoes(s => ({ ...s, [origem]: { ...s[origem], [k]: typeof v === 'function' ? v(s[origem][k]) : v } }))
  const setAssunto = v => mudaVersao('assunto', v)
  const setTexto = v => mudaVersao('texto', v)
  const [waId, setWaId] = useState(etapa.wa_template_id || '')
  const [waParams, setWaParams] = useState(etapa.wa_params || [])
  const [waTexto, setWaTexto] = useState(etapa.wa_texto || '')
  const email = aba === 'email'
  const qc = useQueryClient()
  // textos globais (dúvidas, contatos, rodapé): editados aqui também, salvos junto e valem para todas as etapas
  const { data: glob } = useQuery({ queryKey: ['cobranca-layout-global'], queryFn: () => cobrancaApi.layoutGlobal().then(r => r.data), enabled: email, staleTime: 0 })
  const [g, setG] = useState(null)
  const [gOrig, setGOrig] = useState(null)
  useEffect(() => { if (glob && !g) { setG(glob.layout); setGOrig(glob.layout) } }, [glob])  // eslint-disable-line react-hooks/exhaustive-deps
  const gMudou = !!(g && gOrig && JSON.stringify(g) !== JSON.stringify(gOrig))
  const [foco, setFoco] = useState(null)          // texto sendo editado direto na prévia (enquanto isso a prévia não recarrega)
  const lanc = etapa.chave === 'lancamento'
  const bloco = lanc ? BLOCO_LANCAMENTO : ETAPAS_TABELA.includes(etapa.chave) ? BLOCO_TABELA : BLOCO_ETAPAS
  const padroes = Object.fromEntries(bloco.map(([k, , p]) => [k, p]))
  const setL = (k, v) => mudaVersao('layout', l => ({ ...l, [k]: v }))
  const copiarAsaas = () => window.confirm('Substituir o texto do Itaú pelo texto do Asaas?') && setVersoes(s => ({ ...s, itau: s.asaas }))
  const whats = aba === 'whatsapp'
  const alternar = c => setWaParams(p => (p.includes(c) ? p.filter(x => x !== c) : [...p, c]))
  const fixo = ['consentimento', 'lancamento'].includes(etapa.chave)

  useEffect(() => {
    if (!email || foco) return
    const t = setTimeout(() => cobrancaApi.previaEtapa(etapa.chave, { assunto, texto, origem, layout, ...(gMudou ? { layout_global: g } : {}) }).then(r => setPrevia(r.data)).catch(() => {}), 350)
    return () => clearTimeout(t)
  }, [assunto, texto, origem, layout, g, foco])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (foco) document.getElementById(`campo-${foco}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [foco])

  // edição direta na prévia: o que aparece ao clicar (texto "cru", com {campos}) e para onde vai o que foi digitado
  const editor = admin ? {
    editavel: k => k === 'texto' || k === 'titulo' || k in padroes || (CHAVES_GLOBAIS.has(k) && !!g),
    bruto: k => (k === 'texto' ? texto : k === 'titulo' ? (layout.titulo || assunto) : CHAVES_GLOBAIS.has(k) ? (g?.[k] || '') : (layout[k] || padroes[k] || '')),
    editar: (k, v) => {
      if (k === 'texto') setTexto(v)
      else if (CHAVES_GLOBAIS.has(k)) setG(x => ({ ...x, [k]: v }))
      else if (k === 'titulo') setL('titulo', v === assunto ? '' : v)
      else setL(k, v === padroes[k] ? '' : v)
    },
    foco: setFoco,
  } : null

  const inserir = c => setTexto(t => `${t}{${c}}`)
  const titulo = `${etapa.nome} — ${email ? 'E-mail' : whats ? 'WhatsApp' : 'configuração'}`
  const balao = waParams.reduce((t, c, i) => t.split(`{{${i + 1}}}`).join(EXEMPLO_WA[c] || c), waTexto)

  const salvar = async () => {
    if (modo === 'automatico' && etapa.modo !== 'automatico' && !window.confirm('Esta etapa passará a ENVIAR SOZINHA, sem aprovação do analista (dentro da janela de envio e só com a chave geral ligada). Confirmar?')) return
    if (email && gMudou) {
      try { await cobrancaApi.salvarLayoutGlobal({ layout: g }); qc.invalidateQueries({ queryKey: ['cobranca-layout-global'] }); setGOrig(g) }
      catch (e) { toast.error(e.response?.data?.detail || 'Erro ao salvar dúvidas/rodapé'); return }
    }
    onSave({
      ...(etapa.chave === 'consentimento' ? {} : etapa.chave === 'lancamento' ? { modo } : { dias, modo }),
      ...(email ? { ...versoes.asaas, itau: versoes.itau } : {}),
      ...(whats ? { wa_template_id: waId, wa_params: waParams, wa_texto: waTexto } : {}),
    })
  }

  return (
    <Modal titulo={titulo} onClose={onClose} largo={email ? 'xl' : true}>
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
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4">
          <div className="space-y-3 md:max-h-[640px] md:overflow-y-auto md:pr-1">
            <div className="rounded-lg border border-gray-200 p-2">
              <p className="text-xs text-gray-500 mb-1.5">Você está editando o e-mail dos boletos do:</p>
              <div className="flex gap-1">
                {[['asaas', 'Asaas (link da fatura)'], ['itau', 'Itaú (PDF anexado)']].map(([v, t]) => (
                  <button key={v} type="button" onClick={() => setOrigem(v)} className={`flex-1 text-sm px-2 py-1.5 rounded-md font-medium ${origem === v ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{t}</button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                Os dois textos são independentes: mudar um não muda o outro.
                {lanc && ' No lançamento, cliente com boletos dos dois bancos recebe o texto do Asaas.'}
                {admin && origem === 'itau' && <> <button type="button" onClick={copiarAsaas} className="text-green-700 hover:underline">Copiar o texto do Asaas para cá</button></>}
              </p>
            </div>
            <Secao n={1} titulo="Caixa de entrada">
              <Campo id="assunto" rotulo="Assunto do e-mail" valor={assunto} disabled={!admin} onChange={setAssunto} />
              <Campo id="preheader" rotulo="Texto de pré-visualização (aparece na caixa de entrada, antes de abrir)" padrao="as primeiras palavras da mensagem"
                valor={layout.preheader || ''} disabled={!admin} onChange={v => setL('preheader', v)} onPadrao={layout.preheader ? () => setL('preheader', '') : null} />
            </Secao>
            <Secao n={2} titulo="Título grande (faixa cinza)">
              <Campo id="titulo" rotulo="Título — o mês da competência sai em verde" padrao={`igual ao assunto: ${assunto}`} ativo={foco === 'titulo'}
                valor={layout.titulo || ''} disabled={!admin} onChange={v => setL('titulo', v)} onPadrao={layout.titulo ? () => setL('titulo', '') : null} />
            </Secao>
            <Secao n={3} titulo="Mensagem">
              <Campo id="texto" rotulo="Texto" longo={8} valor={texto} ativo={foco === 'texto'} disabled={!admin} onChange={setTexto} />
              {admin && <div className="flex flex-wrap gap-1.5">{campos.map(c => <button key={c} onClick={() => inserir(c)} className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">{`{${c}}`}</button>)}</div>}
            </Secao>
            <Secao n={4} titulo={lanc ? 'Bloco da fatura' : 'Dados do boleto'}>
              {bloco.map(([k, rotulo, padrao]) => (
                <Campo key={k} id={k} rotulo={rotulo} padrao={padrao} ativo={foco === k} valor={layout[k] || ''} disabled={!admin}
                  onChange={v => setL(k, v)} onPadrao={layout[k] ? () => setL(k, '') : null} />
              ))}
              <p className="text-[11px] text-gray-400">Nos boletos do Itaú, no lugar do botão aparece o selo “PDF anexado”.</p>
            </Secao>
            {!g ? <p className="text-xs text-gray-400">Carregando dúvidas e rodapé…</p> : (
              <>
                <Secao n={5} titulo="Dúvidas e contatos" todas>
                  {GLOBAL_DUVIDAS.map(([k, rotulo, longo]) => (
                    <Campo key={k} id={k} rotulo={rotulo} longo={longo} ativo={foco === k} valor={g[k] || ''} disabled={!admin}
                      onChange={v => setG(x => ({ ...x, [k]: v }))} onPadrao={glob?.padrao && g[k] !== glob.padrao[k] ? () => setG(x => ({ ...x, [k]: glob.padrao[k] })) : null} />
                  ))}
                </Secao>
                <Secao n={6} titulo="Rodapé" todas>
                  {GLOBAL_RODAPE.map(([k, rotulo, longo]) => (
                    <Campo key={k} id={k} rotulo={rotulo} longo={longo} ativo={foco === k} valor={g[k] || ''} disabled={!admin}
                      onChange={v => setG(x => ({ ...x, [k]: v }))} onPadrao={glob?.padrao && g[k] !== glob.padrao[k] ? () => setG(x => ({ ...x, [k]: glob.padrao[k] })) : null} />
                  ))}
                  <p className="text-[11px] text-gray-400">O link de descadastro só abre um e-mail para o endereço do rodapé: o descadastro é tratado por uma pessoa.</p>
                </Secao>
              </>
            )}
            <p className="text-xs text-gray-400">Campo em branco usa o texto padrão (o cinza dentro do campo). Todos aceitam os campos da mensagem, como {'{nome}'} e {'{competencia}'}.</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-500">Prévia do e-mail{previa?.exemplo ? ` — ${previa.exemplo}` : ''}</p>
              <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700">{origem === 'itau' ? 'Itaú (PDF)' : 'Asaas (link)'}</span>
            </div>
            <p className="text-sm font-medium text-gray-800 mb-1">Assunto: {previa?.assunto}</p>
            {admin && <p className="text-xs text-green-700 bg-green-50 rounded-md px-2 py-1 mb-2">✎ Clique em qualquer texto do e-mail para editar ali mesmo. Enter (ou clicar fora) conclui; na mensagem, Enter quebra a linha.</p>}
            {previa?.html ? <PreviaEmail html={previa.html} editor={editor} /> : (
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
        <div className="flex justify-end items-center gap-2 mt-5">
          {email && gMudou && <p className="text-xs text-amber-700 mr-auto">Você mudou textos de dúvidas/rodapé: ao salvar, valem para todas as etapas.</p>}
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
