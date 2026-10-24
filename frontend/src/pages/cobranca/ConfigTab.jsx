import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { cobrancaApi } from '../../services/api'
import { Confirmar } from './ui'

export default function ConfigTab({ onChange }) {
  const qc = useQueryClient()
  const { data, isError } = useQuery({ queryKey: ['cobranca-config'], queryFn: () => cobrancaApi.config().then(r => r.data), staleTime: 0 })
  const [f, setF] = useState(null)
  const [etapaTeste, setEtapaTeste] = useState('vence_hoje')
  const [origemTeste, setOrigemTeste] = useState('asaas')
  const [senha, setSenha] = useState('')
  const [tokenUmbler, setTokenUmbler] = useState('')
  const [senhaImap, setSenhaImap] = useState('')
  const [avancado, setAvancado] = useState(false)
  const [conf, setConf] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { if (data) setF({ ...data, smtp_seguranca: ['starttls', 'ssl'].includes(data.smtp_seguranca) ? data.smtp_seguranca : 'starttls' }) }, [data])
  if (isError) return <div className="p-8 text-center text-sm text-red-500">Não foi possível carregar a configuração (sem permissão ou servidor indisponível).</div>
  if (!f) return <div className="p-8 text-center text-sm text-gray-400">Carregando…</div>

  const salvar = async (body, msg = 'Configuração salva') => {
    setOcupado(true)
    try { await cobrancaApi.salvarConfig(body); toast.success(msg); setSenha(''); setTokenUmbler(''); setSenhaImap(''); setConf(null); qc.invalidateQueries({ queryKey: ['cobranca-config'] }); onChange() }
    catch (e) { toast.error(e.response?.data?.detail || 'Erro ao salvar') }
    finally { setOcupado(false) }
  }
  const testar = async () => {
    try { const { data: d } = await cobrancaApi.smtpTeste({ etapa: etapaTeste, origem: origemTeste }); toast.success(`E-mail de teste (${d.etapa}) enviado para ${d.para}`) }
    catch (e) { toast.error(e.response?.data?.detail || 'Falha no teste') }
  }
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const Campo = ({ rotulo, children }) => <label className="text-xs text-gray-500 block">{rotulo}<div className="mt-1">{children}</div></label>
  const inp = 'w-full border border-gray-200 rounded-lg p-2 text-sm text-gray-800'

  const alternarEnvio = () => {
    if (!f.envio_ativo) setConf({
      titulo: 'Ligar o envio da régua',
      texto: f.modo_teste
        ? `O sistema passa a enviar as mensagens aprovadas. O MODO TESTE está ligado: tudo vai para ${f.email_teste}, nenhum cliente recebe.`
        : 'O sistema passa a enviar as mensagens aprovadas PARA OS CLIENTES, usando o e-mail da empresa. Confirme que o modo teste foi validado.',
      aviso: f.modo_teste ? null : 'O modo teste está desligado: as mensagens vão para os clientes de verdade.',
      rotulo: 'Ligar envio', ok: () => salvar({ envio_ativo: true }, 'Envio ligado'),
    })
    else salvar({ envio_ativo: false }, 'Envio desligado')
  }
  const alternarTeste = () => {
    if (f.modo_teste) setConf({
      titulo: 'Desligar o modo teste',
      texto: 'A partir de agora, as mensagens aprovadas vão para os e-mails dos CLIENTES. Antes de continuar, confira que os e-mails de teste chegaram certos e que os textos estão aprovados.',
      aviso: 'Isso é o que faz a régua falar com cliente de verdade.', rotulo: 'Desligar modo teste', perigo: true, ok: () => salvar({ modo_teste: false }, 'Modo teste desligado'),
    })
    else salvar({ modo_teste: true }, 'Modo teste ligado')
  }

  const testarUmbler = async () => {
    try {
      const { data: d } = await cobrancaApi.testarUmbler()
      const orgs = (d.conta?.organizacoes || []).map(o => `${o.nome} (${o.id})`).join(', ')
      toast.success(`Conexão ok${orgs ? ` — organização: ${orgs}` : ''}${d.canal?.estado ? ` · canal: ${d.canal.estado}` : ''}`, { duration: 8000 })
      onChange()
    } catch (e) { toast.error(e.response?.data?.detail || 'Falha ao testar a Umbler') }
  }
  const alternarWhats = () => {
    if (!f.whatsapp_ativo) setConf({
      titulo: 'Ligar o WhatsApp',
      texto: f.modo_teste
        ? `O sistema passa a enviar as mensagens de WhatsApp aprovadas. O MODO TESTE está ligado: tudo vai para ${f.whatsapp_telefone_teste || '(falta o número de teste)'}, nenhum cliente recebe.`
        : 'O sistema passa a enviar WhatsApp PARA OS CLIENTES pelo número oficial do financeiro. Confirme que os templates foram aprovados, que o piloto foi feito e que o limite diário está baixo no começo.',
      aviso: f.modo_teste ? null : 'O modo teste está desligado: as mensagens vão para clientes de verdade, pelo número oficial.',
      rotulo: 'Ligar WhatsApp', perigo: !f.modo_teste, ok: () => salvar({ whatsapp_ativo: true }, 'WhatsApp ligado'),
    })
    else salvar({ whatsapp_ativo: false }, 'WhatsApp desligado')
  }

  return (
    <div className="p-5 space-y-6 max-w-3xl">
      <section className="space-y-3">
        <p className="text-sm font-semibold text-gray-800">Chaves de segurança</p>
        <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
          <div className="px-4 py-3 flex items-center gap-4">
            <div className="flex-1"><p className="text-sm text-gray-800">Envio da régua</p><p className="text-xs text-gray-500">Desligado: nada sai, mesmo aprovado. Fica desligado até você ligar.</p></div>
            <button onClick={alternarEnvio} className={`w-11 h-6 rounded-full relative ${f.envio_ativo ? 'bg-green-500' : 'bg-gray-300'}`} aria-label="Ligar ou desligar envio"><span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${f.envio_ativo ? 'left-[22px]' : 'left-0.5'}`} /></button>
          </div>
          <div className="px-4 py-3 flex items-center gap-4">
            <div className="flex-1"><p className="text-sm text-gray-800">Modo teste</p><p className="text-xs text-gray-500">Ligado: todas as mensagens vão para o e-mail de teste, com o destino real no assunto.</p></div>
            <button onClick={alternarTeste} className={`w-11 h-6 rounded-full relative ${f.modo_teste ? 'bg-amber-500' : 'bg-gray-300'}`} aria-label="Ligar ou desligar modo teste"><span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${f.modo_teste ? 'left-[22px]' : 'left-0.5'}`} /></button>
          </div>
          <div className="px-4 py-3 flex items-center gap-4">
            <div className="flex-1"><p className="text-sm text-gray-800">Gerar a fila todo dia de manhã</p><p className="text-xs text-gray-500">Só cria os itens (a partir das 07:00). Nunca envia sozinho.</p></div>
            <button onClick={() => salvar({ geracao_automatica: !f.geracao_automatica }, 'Salvo')} className={`w-11 h-6 rounded-full relative ${f.geracao_automatica ? 'bg-green-500' : 'bg-gray-300'}`} aria-label="Geração automática"><span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${f.geracao_automatica ? 'left-[22px]' : 'left-0.5'}`} /></button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold text-gray-800">Limites e teste</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="E-mail de teste"><input className={inp} value={f.email_teste} onChange={e => set('email_teste', e.target.value)} /></Campo>
          <Campo rotulo="Limite de envios por dia"><input type="number" className={inp} value={f.limite_diario} onChange={e => set('limite_diario', parseInt(e.target.value || '0', 10))} /></Campo>
        </div>
        <button onClick={() => salvar({ email_teste: f.email_teste, limite_diario: f.limite_diario })} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Salvar</button>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold text-gray-800">Conta de e-mail que envia</p>
        <p className="text-xs text-gray-500">Use o servidor SMTP do provedor do e-mail da empresa. A senha é guardada no servidor, nunca aparece de volta nesta tela nem nos registros. Ao trocar o servidor ou o usuário, é preciso digitar a senha de novo.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="E-mail do remetente"><input className={inp} value={f.remetente} onChange={e => set('remetente', e.target.value)} /></Campo>
          <Campo rotulo="Servidor SMTP"><input className={inp} value={f.smtp_host} onChange={e => set('smtp_host', e.target.value)} placeholder="ex.: smtp.seuprovedor.com" /></Campo>
          <Campo rotulo="Porta"><input type="number" className={inp} value={f.smtp_porta} onChange={e => set('smtp_porta', parseInt(e.target.value || '0', 10))} /></Campo>
          <Campo rotulo="Segurança"><select className={inp} value={f.smtp_seguranca} onChange={e => set('smtp_seguranca', e.target.value)}><option value="starttls">STARTTLS (porta 587)</option><option value="ssl">SSL (porta 465)</option></select></Campo>
          <Campo rotulo="Usuário"><input className={inp} value={f.smtp_usuario} onChange={e => set('smtp_usuario', e.target.value)} autoComplete="off" /></Campo>
          <Campo rotulo="Senha"><input type="password" className={inp} value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" placeholder={f.smtp_senha_configurada ? '•••••••• (já configurada — deixe vazio para manter)' : 'digite a senha'} /></Campo>
        </div>
        <div className="flex gap-2">
          <button onClick={() => salvar({ remetente: f.remetente, smtp_host: f.smtp_host, smtp_porta: f.smtp_porta, smtp_seguranca: f.smtp_seguranca, smtp_usuario: f.smtp_usuario, ...(senha ? { smtp_senha: senha } : {}) })} className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white">Salvar e-mail</button>
          <select value={etapaTeste} onChange={e => setEtapaTeste(e.target.value)} className="text-sm border border-gray-200 rounded-lg p-1.5 text-gray-700" aria-label="Etapa do e-mail de teste">
            <option value="lancamento">Lançamento do ciclo</option><option value="lembrete">Lembrete</option><option value="vence_hoje">Vencimento</option><option value="atraso">Em atraso</option><option value="bloqueio">Aviso de bloqueio</option>
          </select>
          <select value={origemTeste} onChange={e => setOrigemTeste(e.target.value)} className="text-sm border border-gray-200 rounded-lg p-1.5 text-gray-700" aria-label="Formato do boleto">
            <option value="asaas">Asaas (link)</option><option value="itau">Itaú (PDF)</option>
          </select>
          <button onClick={testar} disabled={!f.smtp_configurado} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Enviar e-mail de teste</button>
        </div>
      </section>
      <section className="space-y-3">
        <p className="text-sm font-semibold text-gray-800">Aviso de lançamento do ciclo</p>
        <p className="text-xs text-gray-500">Quando um boleto é <b>emitido</b> (Itaú: data de emissão; Asaas: data de criação), o cliente recebe UM e-mail com todos os boletos novos dele (PDF do Itaú anexado / link do Asaas), depois da sua aprovação na Fila. Só entram boletos emitidos a partir da data abaixo — deixe em branco para manter o aviso desligado. Ao ligar para o próximo ciclo, coloque a data do dia do lançamento, para não avisar boletos antigos.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="Avisar boletos emitidos a partir de"><input type="date" className={inp} value={f.lancamento_desde || ''} onChange={e => set('lancamento_desde', e.target.value)} /></Campo>
          <Campo rotulo="E só os emitidos nos últimos (dias)"><input type="number" min="1" max="60" className={inp} value={f.lancamento_janela_dias || 10} onChange={e => set('lancamento_janela_dias', parseInt(e.target.value || '10', 10))} /></Campo>
        </div>
        <button onClick={() => salvar({ lancamento_desde: f.lancamento_desde || '', lancamento_janela_dias: f.lancamento_janela_dias || 10 })} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Salvar aviso de lançamento</button>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold text-gray-800">Horário de envio</p>
        <p className="text-xs text-gray-500">Vale para e-mail e WhatsApp. O cliente <b>nunca</b> recebe em sábado, domingo ou feriado nacional (inclui Carnaval, Sexta-feira Santa e Corpus Christi). O que for aprovado fora da janela espera e sai na próxima.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
          <Campo rotulo="Início"><input type="time" className={inp} value={f.horario_inicio} onChange={e => set('horario_inicio', e.target.value)} /></Campo>
          <Campo rotulo="Fim"><input type="time" className={inp} value={f.horario_fim} onChange={e => set('horario_fim', e.target.value)} /></Campo>
        </div>
        <Campo rotulo="Feriados extras, municipais ou estaduais (opcional) — ex.: 08/04, 25/01, 14/05/2027"><input className={inp} value={f.feriados_extra || ''} onChange={e => set('feriados_extra', e.target.value)} placeholder="dd/mm separados por vírgula (sem ano = todo ano)" /></Campo>
        <button onClick={() => salvar({ horario_inicio: f.horario_inicio, horario_fim: f.horario_fim, feriados_extra: f.feriados_extra || '' })} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Salvar horário</button>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold text-gray-800">WhatsApp (Umbler)</p>
        <p className="text-xs text-gray-500">O número do canal é o oficial do financeiro: por isso o WhatsApp tem chave própria, limites e um disjuntor que pausa tudo sozinho se houver falhas seguidas ou se a Umbler/Meta restringir o canal.</p>
        {f.whatsapp_pausado_motivo && <p className="text-sm bg-red-50 text-red-700 rounded-lg px-3 py-2">WhatsApp pausado automaticamente: {f.whatsapp_pausado_motivo}. Confira a Umbler e ligue de novo abaixo quando estiver resolvido.</p>}
        <div className="border border-gray-100 rounded-lg px-4 py-3 flex items-center gap-4">
          <div className="flex-1"><p className="text-sm text-gray-800">WhatsApp ligado</p><p className="text-xs text-gray-500">{f.whatsapp_canal_estado ? `Último estado do canal: ${f.whatsapp_canal_estado}` : 'Desligado: nenhuma mensagem de WhatsApp sai.'}</p></div>
          <button onClick={alternarWhats} className={`w-11 h-6 rounded-full relative ${f.whatsapp_ativo ? 'bg-green-500' : 'bg-gray-300'}`} aria-label="Ligar ou desligar WhatsApp"><span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${f.whatsapp_ativo ? 'left-[22px]' : 'left-0.5'}`} /></button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="Token da API (só escrita)"><input type="password" className={inp} value={tokenUmbler} onChange={e => setTokenUmbler(e.target.value)} autoComplete="new-password" placeholder={f.umbler_token_configurado ? '•••••••• (já configurado — deixe vazio para manter)' : 'cole o token da Umbler'} /></Campo>
          <Campo rotulo="ID da organização"><input className={inp} value={f.umbler_org_id} onChange={e => set('umbler_org_id', e.target.value)} /></Campo>
          <Campo rotulo="Número do canal que envia (oficial)"><input className={inp} value={f.umbler_from_phone} onChange={e => set('umbler_from_phone', e.target.value)} placeholder="(11) 9XXXX-XXXX" /></Campo>
          <Campo rotulo="Número de teste (modo teste)"><input className={inp} value={f.whatsapp_telefone_teste} onChange={e => set('whatsapp_telefone_teste', e.target.value)} placeholder="seu celular" /></Campo>
          <Campo rotulo="Limite a cada 5 minutos (máx. 100)"><input type="number" className={inp} value={f.whatsapp_limite_5min} onChange={e => set('whatsapp_limite_5min', parseInt(e.target.value || '0', 10))} /></Campo>
          <Campo rotulo="Limite por dia (comece baixo e suba aos poucos)"><input type="number" className={inp} value={f.whatsapp_limite_diario} onChange={e => set('whatsapp_limite_diario', parseInt(e.target.value || '0', 10))} /></Campo>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => salvar({ umbler_org_id: f.umbler_org_id, umbler_from_phone: f.umbler_from_phone, whatsapp_telefone_teste: f.whatsapp_telefone_teste, whatsapp_limite_5min: f.whatsapp_limite_5min, whatsapp_limite_diario: f.whatsapp_limite_diario, ...(tokenUmbler ? { umbler_token: tokenUmbler } : {}) })} className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white">Salvar WhatsApp</button>
          <button onClick={testarUmbler} disabled={!f.umbler_token_configurado} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Testar conexão (só leitura)</button>
        </div>
      </section>
      <section className="space-y-3">
        <p className="text-sm font-semibold text-gray-800">E-mails devolvidos (leitura da caixa de entrada)</p>
        <p className="text-xs text-gray-500">Quando um e-mail não chega (endereço errado, caixa cheia…), o servidor do cliente devolve uma mensagem automática para a caixa que enviou. O sistema lê essa caixa (somente leitura: não apaga, não move e não marca nada) e passa a tratar o endereço como inválido. Deixe usuário e senha em branco para usar os mesmos do envio.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="Servidor IMAP"><input className={inp} value={f.imap_host || ''} onChange={e => set('imap_host', e.target.value)} placeholder="ex.: imap.seuprovedor.com" /></Campo>
          <Campo rotulo="Porta (SSL)"><input type="number" className={inp} value={f.imap_porta || 993} onChange={e => set('imap_porta', parseInt(e.target.value || '0', 10))} /></Campo>
          <Campo rotulo="Usuário (opcional)"><input className={inp} value={f.imap_usuario || ''} onChange={e => set('imap_usuario', e.target.value)} autoComplete="off" /></Campo>
          <Campo rotulo="Senha (opcional, só escrita)"><input type="password" className={inp} value={senhaImap} onChange={e => setSenhaImap(e.target.value)} autoComplete="new-password" placeholder={f.imap_senha_configurada ? '•••••••• (já configurada)' : 'em branco = a mesma do envio'} /></Campo>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => salvar({ imap_host: f.imap_host || '', imap_porta: f.imap_porta, imap_usuario: f.imap_usuario || '', ...(senhaImap ? { imap_senha: senhaImap } : {}) })} className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white">Salvar leitura de devoluções</button>
          <button onClick={async () => { try { const { data: d } = await cobrancaApi.testarCaixa(); toast.success(`Caixa acessada (${d.mensagens} mensagens). Só leitura.`) } catch (e) { toast.error(e.response?.data?.detail || 'Falha ao acessar a caixa') } }} disabled={!f.imap_configurado} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Testar acesso à caixa</button>
        </div>
      </section>
      {conf && <Confirmar {...conf} ocupado={ocupado} onClose={() => setConf(null)} onOk={conf.ok} />}
    </div>
  )
}
