import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AlertTriangle, Plus, Upload, Search, Pencil, Trash2, X, Loader2 } from 'lucide-react'
import { attentionApi } from '../../services/api'

// Aba "Atenção" do Faturamento — clientes que exigem atenção extra.
// O motor de faturamento consulta esta lista ANTES de cada ciclo:
//   Ativação / Cancelamento + proporcional "Sim" → cobra proporcional aos dias
//   Desconto                                    → abate % ou R$ do total do cliente,
//                                                 registrando o motivo na descrição do ajuste
// As linhas ficam valendo para os próximos ciclos até serem editadas ou removidas.

const MOTIVOS = [
  { value: 'ativacao',     label: 'Ativação',     cor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'cancelamento', label: 'Cancelamento', cor: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'desconto',     label: 'Desconto',     cor: 'bg-amber-50 text-amber-700 border-amber-200' },
]
const MOTIVO_BY = Object.fromEntries(MOTIVOS.map(m => [m.value, m]))

const INPUT = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none bg-white'
const LABEL = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1'

const fmtBRL = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

function fmtDoc(d) {
  const x = String(d || '').replace(/\D/g, '')
  if (x.length === 14) return x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  if (x.length === 11) return x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return d || '—'
}

function descontoTxt(a) {
  if (a.motivo !== 'desconto' || !a.desconto_valor) return '—'
  return a.desconto_tipo === 'percentual' ? `${a.desconto_valor}%` : fmtBRL(a.desconto_valor)
}

export default function AttentionPage() {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [search, setSearch] = useState('')
  const [motivo, setMotivo] = useState('')
  const [editing, setEditing] = useState(null)   // null = fechado · {} = novo · {...} = editar
  const [importing, setImporting] = useState(false)

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['attention', search, motivo],
    queryFn: () => attentionApi.list({ search: search || undefined, motivo: motivo || undefined }).then(r => r.data),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['attention'] })

  const handleDelete = async (a) => {
    if (!window.confirm(`Remover ${a.nome || a.id_smart} (${MOTIVO_BY[a.motivo]?.label}) da lista de atenção?\n\nNos próximos ciclos o motor deixa de aplicar essa regra.`)) return
    try {
      await attentionApi.remove(a.id)
      toast.success('Removido da lista')
      refresh()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao remover')
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await attentionApi.import(fd)
      toast.success(`${data.criados} cliente(s) importado(s) · ${data.ignorados} já estavam na lista${data.invalidos ? ` · ${data.invalidos} linha(s) ignorada(s)` : ''}`)
      refresh()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao importar a planilha')
    } finally {
      setImporting(false)
    }
  }

  const total = rows.length
  const porMotivo = Object.fromEntries(MOTIVOS.map(m => [m.value, rows.filter(r => r.motivo === m.value).length]))
  const filtrando = !!(search || motivo)

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-500" /> Atenção
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Clientes que precisam de atenção extra no faturamento. Antes de rodar cada ciclo, o motor consulta esta lista e
            aplica o <strong>proporcional</strong> de ativação/cancelamento ou o <strong>desconto</strong>. O que você
            cadastrar aqui vale para os próximos ciclos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            title='Importa a planilha antiga "Atencao_com_esses_clientes.xlsx" (aba "Cancelamento e Suspenção")'>
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Importar planilha
          </button>
          <button onClick={() => setEditing({})}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #3CB54A, #2EA040)' }}>
            <Plus size={14} /> Adicionar cliente
          </button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Clientes na lista', val: total },
          ...MOTIVOS.map(m => ({ label: m.label, val: porMotivo[m.value] })),
        ].map(({ label, val }) => (
          <div key={label} className="gs-card p-4">
            <p className="gs-label">{label}</p>
            <p className="gs-value">{val}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, CNPJ, ID Smart ou observação…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none bg-white" />
        </div>
        <select value={motivo} onChange={e => setMotivo(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none bg-white">
          <option value="">Todos os motivos</option>
          {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        {filtrando && (
          <button onClick={() => { setSearch(''); setMotivo('') }}
            className="text-xs font-semibold text-gray-500 hover:text-gray-800 underline">Limpar filtros</button>
        )}
      </div>

      {/* Tabela */}
      <div className="gs-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={24} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500 mb-1">
              {filtrando ? 'Nenhum cliente encontrado com esse filtro' : 'Nenhum cliente na lista de atenção ainda'}
            </p>
            {!filtrando && (
              <p className="text-xs text-gray-400 max-w-md mx-auto">
                Adicione um cliente ou importe a planilha antiga de atenção. Enquanto a lista estiver vazia,
                o motor fatura todos os clientes normalmente (sem proporcional e sem desconto).
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/70">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">CNPJ</th>
                  <th className="px-4 py-3">ID Smart</th>
                  <th className="px-4 py-3 text-center">Proporcional</th>
                  <th className="px-4 py-3">Motivo</th>
                  <th className="px-4 py-3 text-center">Desconto</th>
                  <th className="px-4 py-3">Obs</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(a => {
                  const m = MOTIVO_BY[a.motivo]
                  return (
                    <tr key={a.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3 font-medium text-gray-800">{a.nome || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap tabular-nums">{fmtDoc(a.cnpj)}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">{a.id_smart}</td>
                      <td className="px-4 py-3 text-center">
                        {a.motivo === 'desconto'
                          ? <span className="text-gray-300">—</span>
                          : <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${a.proporcional ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                              {a.proporcional ? 'Sim' : 'Não'}
                            </span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${m?.cor || ''}`}>{m?.label || a.motivo}</span>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-gray-700">{descontoTxt(a)}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[280px] truncate" title={a.obs || ''}>{a.obs || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setEditing(a)} title="Editar"
                          className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 mr-1.5"><Pencil size={13} /></button>
                        <button onClick={() => handleDelete(a)} title="Remover"
                          className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <AttentionForm
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}
    </div>
  )
}

// ── Formulário (novo / editar) ────────────────────────────────
function AttentionForm({ item, onClose, onSaved }) {
  const isEdit = !!item.id
  const [busca, setBusca] = useState('')
  const [sugestoes, setSugestoes] = useState([])
  const [form, setForm] = useState({
    nome: item.nome || '',
    cnpj: item.cnpj || '',
    id_smart: item.id_smart || '',
    motivo: item.motivo || 'ativacao',
    proporcional: item.id ? !!item.proporcional : true,
    desconto_tipo: item.desconto_tipo || 'percentual',
    desconto_valor: item.desconto_valor ?? '',
    obs: item.obs || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const ehDesconto = form.motivo === 'desconto'

  // Autocompletar: acha o cliente por nome / CNPJ / ID Smart e preenche a linha
  useEffect(() => {
    if (isEdit || busca.trim().length < 3) { setSugestoes([]); return }
    const t = setTimeout(() => {
      attentionApi.lookup(busca.trim()).then(r => setSugestoes(r.data)).catch(() => setSugestoes([]))
    }, 300)
    return () => clearTimeout(t)
  }, [busca, isEdit])

  const escolher = (c) => {
    setForm(f => ({ ...f, nome: c.nome || '', cnpj: c.cnpj || '', id_smart: c.id_smart || '' }))
    setBusca('')
    setSugestoes([])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.cnpj && !form.id_smart) return toast.error('Informe o CNPJ/CPF ou o ID Smart do cliente')
    const payload = {
      nome: form.nome || null,
      cnpj: form.cnpj || null,
      id_smart: form.id_smart || null,
      motivo: form.motivo,
      proporcional: ehDesconto ? false : form.proporcional,
      desconto_tipo: ehDesconto ? form.desconto_tipo : null,
      desconto_valor: ehDesconto ? Number(String(form.desconto_valor).replace(',', '.')) : null,
      obs: form.obs || null,
    }
    setSaving(true)
    try {
      if (isEdit) await attentionApi.update(item.id, payload)
      else await attentionApi.create(payload)
      toast.success(isEdit ? 'Alterações salvas' : 'Cliente adicionado à lista')
      onSaved()
    } catch (err) {
      const d = err.response?.data?.detail
      toast.error(typeof d === 'string' ? d : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="text-base font-bold text-gray-900">{isEdit ? 'Editar cliente em atenção' : 'Adicionar cliente em atenção'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Vale para os próximos ciclos de faturamento.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Fechar"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!isEdit && (
            <div className="relative">
              <label className={LABEL}>Buscar cliente</label>
              <input value={busca} onChange={e => setBusca(e.target.value)} className={INPUT}
                placeholder="Digite o nome, CNPJ ou ID Smart (mín. 3 caracteres)" autoFocus />
              {sugestoes.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-56 overflow-y-auto">
                  {sugestoes.map(c => (
                    <button type="button" key={c.id_smart} onClick={() => escolher(c)}
                      className="w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-50 last:border-0">
                      <p className="text-sm font-medium text-gray-800">{c.nome || '(sem nome)'}</p>
                      <p className="text-[11px] text-gray-400">{fmtDoc(c.cnpj)} · {c.id_smart}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={LABEL}>Nome</label>
              <input value={form.nome} onChange={e => set('nome', e.target.value)} className={INPUT} placeholder="Nome do cliente" />
            </div>
            <div>
              <label className={LABEL}>CNPJ / CPF</label>
              <input value={form.cnpj} onChange={e => set('cnpj', e.target.value)} className={INPUT} placeholder="Somente números" />
            </div>
            <div>
              <label className={LABEL}>ID Smart</label>
              <input value={form.id_smart} onChange={e => set('id_smart', e.target.value)} className={`${INPUT} font-mono`} placeholder="ss_ + CNPJ (preenche sozinho)" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Motivo</label>
              <select value={form.motivo} onChange={e => set('motivo', e.target.value)} className={INPUT}>
                {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            {!ehDesconto && (
              <div>
                <label className={LABEL}>Proporcional</label>
                <select value={form.proporcional ? 'sim' : 'nao'} onChange={e => set('proporcional', e.target.value === 'sim')} className={INPUT}>
                  <option value="sim">Sim — cobrar proporcional aos dias</option>
                  <option value="nao">Não — cobrar o mês cheio</option>
                </select>
              </div>
            )}
          </div>

          {ehDesconto && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-200">
              <div>
                <label className={LABEL}>Tipo de desconto</label>
                <select value={form.desconto_tipo} onChange={e => set('desconto_tipo', e.target.value)} className={INPUT}>
                  <option value="percentual">Percentual (%) do total</option>
                  <option value="valor">Valor fixo (R$)</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>{form.desconto_tipo === 'percentual' ? 'Percentual' : 'Valor (R$)'}</label>
                <input value={form.desconto_valor} onChange={e => set('desconto_valor', e.target.value)} className={INPUT}
                  inputMode="decimal" placeholder={form.desconto_tipo === 'percentual' ? 'Ex.: 10' : 'Ex.: 50,00'} />
              </div>
              <p className="sm:col-span-2 text-[11px] text-amber-800">
                O desconto é abatido do total do cliente em todo ciclo e aparece nos Ajustes com o motivo (sua observação) na descrição.
              </p>
            </div>
          )}

          <div>
            <label className={LABEL}>Observação {ehDesconto && <span className="normal-case font-normal text-gray-400">(vai na descrição do desconto)</span>}</label>
            <textarea value={form.obs} onChange={e => set('obs', e.target.value)} rows={3} className={INPUT}
              placeholder={ehDesconto ? 'Ex.: acordo comercial com o Patrick, válido até dez/2026' : 'Ex.: cliente ativou no meio do mês, combinado cobrar proporcional'} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #3CB54A, #2EA040)' }}>
              {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : (isEdit ? 'Salvar alterações' : 'Adicionar à lista')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
