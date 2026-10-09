import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
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
function FmtInput({ value, onChange, prefix, suffix, disabled }) {
  const [focus, setFocus] = useState(false)
  const shown = focus ? String(value ?? '') : fmtDec(parseNum(value))
  return (
    <div className="inline-flex items-center justify-end gap-1.5 w-36 px-3 py-2 border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-green-500">
      {prefix && <span className="text-xs text-gray-400">{prefix}</span>}
      <input
        value={shown} inputMode="decimal" disabled={disabled}
        onFocus={e => { setFocus(true); e.target.select() }}
        onBlur={() => setFocus(false)}
        onChange={e => onChange(e.target.value)}
        className="w-full min-w-0 text-sm text-right bg-transparent focus:outline-none"
      />
      {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
    </div>
  )
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

  const TH = 'px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right'
  const TD = 'px-4 py-3 text-sm text-right text-gray-800'
  const ROW_LABEL = 'px-4 py-3 text-sm font-medium text-gray-700 text-left whitespace-nowrap'
  const SECTION = 'px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-50 text-left'

  if (error) {
    return (
      <div className="gs-card p-8 text-center text-sm text-gray-500">
        {error.response?.data?.detail || 'Não foi possível carregar o comissionamento.'}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Comissionamento</h1>
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
              {saving && <Loader2 size={14} className="animate-spin" />} Salvar
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="gs-card px-4 py-2.5">
            <p className="gs-label">Analista</p>
            <p className="gs-value text-base">{data.analista.name}</p>
          </div>
          <div className="gs-card px-4 py-2.5">
            <p className="gs-label">Previsão do mês</p>
            <p className="gs-value text-base">{fmtBRL(totalPrevisao)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">se todas as metas forem batidas</p>
          </div>
          <div className="gs-card px-4 py-2.5">
            <p className="gs-label">Realizado até o momento</p>
            <p className="gs-value text-base text-green-700">{fmtBRL(totalLive)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">só metas definidas e já atingidas</p>
          </div>
        </div>
      )}

      <div className="gs-card overflow-x-auto p-0">
        {isLoading ? (
          <div className="py-16 flex items-center justify-center text-sm text-gray-400 gap-2">
            <Loader2 size={16} className="animate-spin" /> Carregando…
          </div>
        ) : !data?.analista ? (
          <div className="py-16 text-center text-sm text-gray-500">
            Cadastre um analista (campo "Adicionar analista…") para configurar o comissionamento.
          </div>
        ) : (
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-left">Vencimento</th>
                {venc.map(v => <th key={v.dia} className={TH}>Dia {v.dia}</th>)}
                <th className={TH}>Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <tr><td colSpan={venc.length + 2} className={SECTION}>Configuração</td></tr>
              <tr>
                <td className={ROW_LABEL}>Valor do vencimento (R$)</td>
                {venc.map(v => <td key={v.dia} className={TD + ' font-medium'}>{fmtBRL(v.faturado)}</td>)}
                <td className={TD + ' font-medium'}>{fmtBRL(venc.reduce((s, v) => s + v.faturado, 0))}</td>
              </tr>
              <tr>
                <td className={ROW_LABEL}>Meta (R$)</td>
                {venc.map(v => (
                  <td key={v.dia} className={TD}>
                    {admin
                      ? <FmtInput value={form[v.dia]?.meta} onChange={val => setField(v.dia, 'meta', val)} prefix="R$" />
                      : fmtBRL(v.meta)}
                  </td>
                ))}
                <td className={TD + ' font-medium'}>{fmtBRL(venc.reduce((s, v) => s + parseNum(form[v.dia]?.meta), 0))}</td>
              </tr>
              <tr>
                <td className={ROW_LABEL}>Percentual do salário (%)</td>
                {venc.map(v => (
                  <td key={v.dia} className={TD}>
                    {admin
                      ? <FmtInput value={form[v.dia]?.percentual} onChange={val => setField(v.dia, 'percentual', val)} suffix="%" />
                      : `${fmtDec(v.percentual)}%`}
                  </td>
                ))}
                <td className={TD + ' font-medium'}>{fmtDec(venc.reduce((s, v) => s + parseNum(form[v.dia]?.percentual), 0))}%</td>
              </tr>
              <tr>
                <td className={ROW_LABEL}>Previsão da comissão</td>
                {venc.map(v => <td key={v.dia} className={TD}>{fmtBRL(previsaoLive(v))}</td>)}
                <td className={TD + ' font-medium'}>{fmtBRL(totalPrevisao)}</td>
              </tr>
              <tr className="bg-green-50/50">
                <td className={ROW_LABEL + ' font-semibold'}>Realizado até o momento</td>
                {venc.map(v => <td key={v.dia} className={TD + ' font-semibold'}>{fmtBRL(valorLive(v))}</td>)}
                <td className={TD + ' font-bold'}>{fmtBRL(totalLive)}</td>
              </tr>

              <tr><td colSpan={venc.length + 2} className={SECTION}>Apuração do mês</td></tr>
              <tr>
                <td className={ROW_LABEL}>Clientes</td>
                {venc.map(v => <td key={v.dia} className={TD}>{fmtNum(v.clientes)}</td>)}
                <td className={TD}>{fmtNum(venc.reduce((s, v) => s + v.clientes, 0))}</td>
              </tr>
              <tr>
                <td className={ROW_LABEL}>Boletos Asaas + Itaú (pagos / emitidos)</td>
                {venc.map(v => <td key={v.dia} className={TD}>{fmtNum(v.pagos)} / {fmtNum(v.boletos)}</td>)}
                <td className={TD}>{fmtNum(venc.reduce((s, v) => s + v.pagos, 0))} / {fmtNum(venc.reduce((s, v) => s + v.boletos, 0))}</td>
              </tr>
              <tr>
                <td className={ROW_LABEL}>Recebido</td>
                {venc.map(v => <td key={v.dia} className={TD}>{fmtBRL(v.recebido)}</td>)}
                <td className={TD}>{fmtBRL(venc.reduce((s, v) => s + v.recebido, 0))}</td>
              </tr>
              <tr>
                <td className={ROW_LABEL + ' pl-8 text-gray-500'}>dos quais no Itaú</td>
                {venc.map(v => <td key={v.dia} className={TD + ' text-gray-500'}>{fmtBRL(v.recebido_itau)}</td>)}
                <td className={TD + ' text-gray-500'}>{fmtBRL(venc.reduce((s, v) => s + v.recebido_itau, 0))}</td>
              </tr>
              <tr>
                <td className={ROW_LABEL}>Adimplência</td>
                {venc.map(v => <td key={v.dia} className={TD}>{fmtDec(v.adimplencia)}%</td>)}
                <td className={TD}>{(() => {
                  const f = venc.reduce((s, v) => s + v.faturado, 0), r = venc.reduce((s, v) => s + v.recebido, 0)
                  return fmtDec(f ? (r / f * 100) : 0) + '%'
                })()}</td>
              </tr>
              <tr>
                <td className={ROW_LABEL}>Meta atingida</td>
                {venc.map(v => {
                  const meta = parseNum(form[v.dia]?.meta)
                  const ok = meta > 0 ? v.recebido >= meta : null
                  return (
                    <td key={v.dia} className={TD}>
                      {ok === null ? <span className="text-gray-400">Sem meta</span>
                        : ok ? <span className="font-semibold text-green-700">Sim</span>
                        : <span className="font-semibold text-red-600">Não</span>}
                    </td>
                  )
                })}
                <td className={TD}>—</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {data?.analista && (
        <div className="gs-card p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="gs-label">Salário base — {data.analista.name}</p>
            <p className="text-xs text-gray-400 mt-1">
              Base do cálculo: a comissão de cada vencimento é o percentual sobre este salário. Vale para o mês e é herdado pelos seguintes.
            </p>
          </div>
          {admin
            ? <FmtInput value={salario} onChange={setSalario} prefix="R$" />
            : <p className="gs-value text-lg">{fmtBRL(data.salario)}</p>}
        </div>
      )}

      <p className="text-xs text-gray-400">
        O mês escolhido é o mês de vencimento: outubro usa os boletos do ciclo de setembro. Valor do vencimento = total que o ciclo
        mandou cobrar em cada vencimento original (arquivo de Vencimentos) mais os boletos do Itaú de clientes que não estão no ciclo.
        Recebido = boletos desses clientes no Asaas e no Itaú, com vencimento no mês e status pago, cruzados por CNPJ/CPF.
      </p>
    </div>
  )
}
