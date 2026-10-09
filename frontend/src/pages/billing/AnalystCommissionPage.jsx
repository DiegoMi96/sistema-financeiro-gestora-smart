import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, Save, User, Target, BarChart3, Trophy, ChevronDown, Wallet, Info } from 'lucide-react'
import { analystCommissionApi } from '../../services/api'

// Aba "Comissionamento" do Faturamento — comissão dos analistas de contas a receber,
// com base na adimplência por vencimento ORIGINAL (10, 15, 20 e 25).
//   Meta (R$)        → quanto precisa ser recebido no vencimento para liberar a comissão (0 = meta ainda não definida: nada liberado)
//   Percentual (%)   → % do SALÁRIO do analista pago se a meta for atingida
//   Valor            → salário × percentual, liberado só se o recebido atingiu a meta
// O admin edita tudo; cada analista vê somente o próprio comissionamento (somente leitura).

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const fmtBRL = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtNum = v => new Intl.NumberFormat('pt-BR').format(v || 0)
const fmtDec = v => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0)

// Formato brasileiro: "1.500,50" → 1500.5 · "1.000" → 1000 (ponto = milhar quando seguido de 3 dígitos)
// · "1500,5" → 1500.5 · "3.5" → 3.5 (ponto com 1–2 dígitos depois = decimal).
const parseNum = s => {
  let t = String(s ?? '').trim().replace(/[^\d.,-]/g, '')
  if (!t) return 0
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}
// número vindo do servidor → texto no formato digitável (vírgula decimal, sem milhar)
const toField = v => String(v ?? 0).replace('.', ',')

// Campo numérico com formatação: "R$ 1.500,00" ou "10,00 %". Em foco mostra o valor cru para digitar.
// O prefixo/sufixo fica numa célula própria, separada por uma linha fina.
function FmtInput({ value, onChange, prefix, suffix, disabled, width = 'w-36' }) {
  const [focus, setFocus] = useState(false)
  const shown = focus ? String(value ?? '') : fmtDec(parseNum(value))
  const cell = 'px-2.5 self-stretch flex items-center bg-gray-50 text-xs text-gray-400'
  return (
    <div className={`inline-flex items-stretch ${width} border border-gray-200 rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-green-500`}>
      {prefix && <span className={cell + ' border-r border-gray-200'}>{prefix}</span>}
      <input
        value={shown} inputMode="decimal" disabled={disabled}
        onFocus={e => { setFocus(true); e.target.select() }}
        onBlur={() => setFocus(false)}
        onChange={e => onChange(e.target.value)}
        className="w-full min-w-0 px-3 py-2 text-sm text-right bg-transparent focus:outline-none"
      />
      {suffix && <span className={cell + ' border-l border-gray-200'}>{suffix}</span>}
    </div>
  )
}

// Cartão de resumo do topo: ícone + rótulo + valor + legenda
function StatCard({ icon: Icon, label, value, hint, tone = 'gray', valueClass = 'text-gray-900' }) {
  const tones = {
    green: 'bg-green-50 border-green-100', gray: 'bg-white border-gray-100',
  }
  const iconTones = { green: 'bg-green-100 text-green-700', gray: 'bg-gray-100 text-gray-600', amber: 'bg-amber-50 text-amber-600' }
  return (
    <div className={`rounded-2xl border shadow-sm px-4 py-3 flex items-center gap-3 ${tones[tone] || tones.gray}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconTones[tone] || iconTones.gray}`}><Icon size={20} /></div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        <p className={`text-lg font-bold leading-tight ${valueClass}`}>{value}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}

function Badge({ tone, children }) {
  const t = { gray: 'bg-gray-100 text-gray-500', green: 'bg-green-100 text-green-700', red: 'bg-red-50 text-red-600' }
  return <span className={`inline-block px-3 py-1 rounded-md text-xs font-semibold ${t[tone]}`}>{children}</span>
}

export default function AnalystCommissionPage() {
  const qc = useQueryClient()
  const hoje = new Date()
  const [year, setYear] = useState(hoje.getFullYear())
  const [month, setMonth] = useState(hoje.getMonth() + 1)
  const [userId, setUserId] = useState(null)       // só admin escolhe; analista vê o próprio
  const [form, setForm] = useState({})             // { [dia]: { percentual, meta } }
  const [salario, setSalario] = useState('0')
  const [saving, setSaving] = useState(false)
  const [openCfg, setOpenCfg] = useState(true)
  const [openApu, setOpenApu] = useState(true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['analyst-commission', year, month, userId],
    queryFn: () => analystCommissionApi.get(year, month, userId).then(r => r.data),
    retry: false,
  })

  useEffect(() => {
    if (!data) return
    setForm(Object.fromEntries(data.vencimentos.map(v => [v.dia, { percentual: toField(v.percentual), meta: toField(v.meta) }])))
    setSalario(toField(data.salario))
  }, [data])

  const admin = !!data?.is_admin
  const venc = data?.vencimentos || []
  const dirtyRules = venc.filter(v => {
    const f = form[v.dia]
    return f && (parseNum(f.percentual) !== (v.percentual || 0) || parseNum(f.meta) !== (v.meta || 0))
  })
  const dirtySalary = parseNum(salario) !== (data?.salario || 0)
  const dirty = dirtyRules.length > 0 || dirtySalary

  const setField = (dia, k, val) => setForm(f => ({ ...f, [dia]: { ...f[dia], [k]: val } }))

  const handleSave = async () => {
    for (const v of dirtyRules) {
      const p = parseNum(form[v.dia].percentual)
      if (p < 0 || p > 100) return toast.error(`Vencimento ${v.dia}: percentual deve estar entre 0 e 100`)
    }
    setSaving(true)
    try {
      const uid = data.analista.id
      if (dirtySalary) await analystCommissionApi.saveSalary({ user_id: uid, year, month, salario: parseNum(salario) })
      for (const v of dirtyRules) {
        await analystCommissionApi.saveConfig({
          user_id: uid, year, month, dia: v.dia,
          percentual: parseNum(form[v.dia].percentual), meta: parseNum(form[v.dia].meta),
        })
      }
      toast.success('Configuração salva')
      qc.invalidateQueries({ queryKey: ['analyst-commission'] })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const handleAddMember = async (id) => {
    if (!id) return
    try {
      await analystCommissionApi.addMember({ user_id: Number(id), year, month })
      toast.success('Analista adicionado')
      setUserId(Number(id))
      qc.invalidateQueries({ queryKey: ['analyst-commission'] })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao adicionar')
    }
  }

  const anos = [hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1]
  const sel = 'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-green-500 focus:outline-none'

  // Valor "ao vivo": reflete o que está digitado antes de salvar
  const previsaoLive = v => {
    const f = form[v.dia]
    return f ? Math.round(parseNum(salario) * parseNum(f.percentual)) / 100 : v.previsao
  }
  // Realizado: só conta vencimento com meta definida (> 0) e já atingida
  const valorLive = v => {
    const f = form[v.dia]
    if (!f) return v.valor
    const meta = parseNum(f.meta)
    return meta > 0 && v.recebido >= meta ? previsaoLive(v) : 0
  }
  const totalLive = venc.reduce((s, v) => s + valorLive(v), 0)
  const totalPrevisao = venc.reduce((s, v) => s + previsaoLive(v), 0)

  const totalMeta = venc.reduce((acc, v) => acc + parseNum(form[v.dia]?.meta), 0)
  const totalPct = venc.reduce((acc, v) => acc + parseNum(form[v.dia]?.percentual), 0)
  const totalFat = venc.reduce((acc, v) => acc + v.faturado, 0)
  const totalRec = venc.reduce((acc, v) => acc + v.recebido, 0)
  const totalCli = venc.reduce((acc, v) => acc + v.clientes, 0)

  // células da tabela: valores centralizados, com divisória vertical entre as colunas
  const TH = 'px-3 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center border-l border-gray-100'
  const TD = 'px-3 py-2.5 text-sm text-center text-gray-800 border-l border-gray-100'
  const ROW_LABEL = 'px-4 py-2.5 text-sm text-gray-700 text-left whitespace-nowrap'
  const nCols = venc.length + 2

  if (error) {
    return (
      <div className="gs-card p-8 text-center text-sm text-gray-500">
        {error.response?.data?.detail || 'Não foi possível carregar o comissionamento.'}
      </div>
    )
  }

  const SectionRow = ({ label, open, toggle, band }) => (
    <tr>
      <td colSpan={nCols} className={band}>
        <button type="button" onClick={toggle} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-bold uppercase tracking-wide">
          <ChevronDown size={16} className={`transition-transform ${open ? '' : '-rotate-90'}`} /> {label}
        </button>
      </td>
    </tr>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comissionamento</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            {admin
              ? 'Comissão dos analistas de contas a receber, com base na adimplência por vencimento original. O percentual incide sobre o salário do analista, se a meta for atingida.'
              : 'Seu comissionamento com base na adimplência por vencimento original. O percentual incide sobre o seu salário, se a meta for atingida.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className={sel}>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className={sel}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {admin && (
            <button onClick={handleSave} disabled={!dirty || saving || !data?.analista} className="gs-btn gs-btn-dark">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
            </button>
          )}
        </div>
      </div>

      {admin && (
        <div className="flex flex-wrap items-center gap-3">
          <select value={data?.analista?.id || ''} onChange={e => setUserId(Number(e.target.value))} className={sel}
            disabled={!data?.analistas?.length}>
            {!data?.analistas?.length && <option value="">Nenhum analista cadastrado</option>}
            {(data?.analistas || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {!!data?.candidatos?.length && (
            <select value="" onChange={e => handleAddMember(e.target.value)} className={sel}>
              <option value="">Adicionar analista…</option>
              {data.candidatos.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
      )}

      {data && !data.ciclo && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Não há boletos com vencimento em {MESES[month - 1]}/{year} (o ciclo do mês anterior ainda não foi processado). Os valores
          aparecem zerados, mas você já pode cadastrar percentual e meta.
        </div>
      )}

      {data?.analista && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <StatCard icon={User} tone="green" label="Analista" value={data.analista.name} />
          <StatCard icon={Target} label="Previsão do mês" value={fmtBRL(totalPrevisao)} hint="Se todas as metas forem batidas" />
          <StatCard icon={BarChart3} label="Realizado até o momento" value={fmtBRL(totalLive)} valueClass="text-green-700" hint="Só metas definidas e já atingidas" />
          <StatCard icon={Trophy} label="Meta do mês (total)" value={fmtBRL(totalMeta)} hint="Soma das metas dos vencimentos" />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        {isLoading ? (
          <div className="py-16 flex items-center justify-center text-sm text-gray-400 gap-2">
            <Loader2 size={16} className="animate-spin" /> Carregando…
          </div>
        ) : !data?.analista ? (
          <div className="py-16 text-center text-sm text-gray-500">
            Cadastre um analista (campo "Adicionar analista…") para configurar o comissionamento.
          </div>
        ) : (
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-left">Vencimento</th>
                {venc.map(v => <th key={v.dia} className={TH}>Dia {v.dia}</th>)}
                <th className={TH}>Total</th>
              </tr>
            </thead>
            <tbody>
              <SectionRow label="Configuração da comissão" open={openCfg} toggle={() => setOpenCfg(o => !o)} band="bg-gray-100 text-gray-700" />
              {openCfg && (<>
                <tr className="border-b border-gray-50">
                  <td className={ROW_LABEL}>Valor do vencimento (R$)</td>
                  {venc.map(v => <td key={v.dia} className={TD}>{fmtBRL(v.faturado)}</td>)}
                  <td className={TD + ' font-bold'}>{fmtBRL(totalFat)}</td>
                </tr>
                <tr className="border-b border-gray-50">
                  <td className={ROW_LABEL}>Meta (R$)</td>
                  {venc.map(v => (
                    <td key={v.dia} className={TD}>
                      {admin
                        ? <FmtInput value={form[v.dia]?.meta} onChange={val => setField(v.dia, 'meta', val)} prefix="R$" />
                        : fmtBRL(v.meta)}
                    </td>
                  ))}
                  <td className={TD + ' font-bold'}>{fmtBRL(totalMeta)}</td>
                </tr>
                <tr className="border-b border-gray-50">
                  <td className={ROW_LABEL}>Percentual do salário (%)</td>
                  {venc.map(v => (
                    <td key={v.dia} className={TD}>
                      {admin
                        ? <FmtInput value={form[v.dia]?.percentual} onChange={val => setField(v.dia, 'percentual', val)} suffix="%" />
                        : `${fmtDec(v.percentual)}%`}
                    </td>
                  ))}
                  <td className={TD + ' font-bold'}>{fmtDec(totalPct)}%</td>
                </tr>
                <tr className="bg-gray-100">
                  <td className={ROW_LABEL + ' font-bold text-gray-800'}>Previsão da comissão</td>
                  {venc.map(v => <td key={v.dia} className={TD}>{fmtBRL(previsaoLive(v))}</td>)}
                  <td className={TD + ' font-bold text-green-700 text-base'}>{fmtBRL(totalPrevisao)}</td>
                </tr>
              </>)}

              <SectionRow label="Apuração do mês" open={openApu} toggle={() => setOpenApu(o => !o)} band="bg-gray-100 text-gray-700" />
              {openApu && (<>
                <tr className="border-b border-gray-50">
                  <td className={ROW_LABEL}>Clientes</td>
                  {venc.map(v => <td key={v.dia} className={TD}>{fmtNum(v.clientes)}</td>)}
                  <td className={TD + ' font-bold'}>{fmtNum(totalCli)}</td>
                </tr>
                <tr className="border-b border-gray-50">
                  <td className={ROW_LABEL}>Recebido no dia (vencimento + 1 dia)</td>
                  {venc.map(v => <td key={v.dia} className={TD}>{fmtBRL(v.recebido)}</td>)}
                  <td className={TD + ' font-bold'}>{fmtBRL(totalRec)}</td>
                </tr>
                <tr className="border-b border-gray-50">
                  <td className={ROW_LABEL}>Adimplência</td>
                  {venc.map(v => <td key={v.dia} className={TD}>{fmtDec(v.adimplencia)}%</td>)}
                  <td className={TD + ' font-bold'}>{fmtDec(totalFat ? totalRec / totalFat * 100 : 0)}%</td>
                </tr>
                <tr>
                  <td className={ROW_LABEL}>Meta atingida</td>
                  {venc.map(v => {
                    const meta = parseNum(form[v.dia]?.meta)
                    return (
                      <td key={v.dia} className={TD}>
                        {meta <= 0 ? <Badge tone="gray">Sem meta</Badge>
                          : v.recebido >= meta ? <Badge tone="green">Atingida</Badge>
                          : <Badge tone="red">Não atingida</Badge>}
                      </td>
                    )
                  })}
                  <td className={TD}>—</td>
                </tr>
              </>)}
            </tbody>
          </table>
        )}
      </div>

      {data?.analista && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-green-50 text-green-700 flex items-center justify-center flex-shrink-0"><Wallet size={20} /></div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Salário base — {data.analista.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Base do cálculo: a comissão de cada vencimento é o percentual sobre este salário. Vale para o mês e é herdado pelos seguintes.
              </p>
            </div>
          </div>
          {admin
            ? <FmtInput value={salario} onChange={setSalario} prefix="R$" width="w-52" />
            : <p className="text-lg font-bold text-gray-900">{fmtBRL(data.salario)}</p>}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex gap-3 text-xs text-slate-500">
        <Info size={16} className="flex-shrink-0 mt-0.5" />
        <p>
          O mês escolhido é o mês de vencimento: outubro usa os boletos do ciclo de setembro. Valor do vencimento = total que o ciclo
          mandou cobrar em cada vencimento original (arquivo de Vencimentos) mais os boletos do Itaú de clientes que não estão no ciclo.
          Recebido no dia = boletos desses clientes no Asaas e no Itaú pagos no próprio dia do vencimento ou no dia seguinte (10 e 11,
          15 e 16, 20 e 21, 25 e 26) — pagamento antecipado ou atrasado não conta —, cruzados por CNPJ/CPF.
        </p>
      </div>
    </div>
  )
}
