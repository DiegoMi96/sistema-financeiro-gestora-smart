import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { authApi } from '../../services/api'
import { useModule } from '../../contexts/ModuleContext'
import toast from 'react-hot-toast'
import { Zap, Building2, FileText, CheckCircle, XCircle, Loader, Eye, EyeOff, Users, Key, Plus, Edit2, Power, ChevronDown, ChevronRight, Shield, Trash2 } from 'lucide-react'

const ALL_TABS = [
  { id: 'regras',      label: 'Regras de Negócio',  faturamentoOnly: true },
  { id: 'empresa',     label: 'Empresa',             faturamentoOnly: true },
  { id: 'acesso',      label: 'Acesso' },
  { id: 'perfis',      label: 'Perfis & Permissões' },
  { id: 'planilha',    label: 'Planilha Google' },
  { id: 'integracoes', label: 'Integrações',        faturamentoOnly: true },
]

export default function SettingsPage() {
  const { activeModule } = useModule()
  const isFaturamento = activeModule === 'faturamento'

  const TABS = ALL_TABS.filter(t => !t.faturamentoOnly || isFaturamento)

  const [tab, setTab] = useState(isFaturamento ? 'regras' : 'acesso')
  const qc = useQueryClient()

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(r => r.data),
    enabled: isFaturamento,
  })

  const save = useMutation({
    mutationFn: (body) => api.put('/settings', body),
    onSuccess: () => { toast.success('Configurações salvas!'); qc.invalidateQueries({ queryKey: ['settings'] }) },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Erro ao salvar'),
  })

  if (isFaturamento && isLoading) return (
    <div className="flex items-center justify-center h-48">
      <Loader size={18} className="animate-spin text-blue-500" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="gs-page-title">Configurações</h1>
        <p className="gs-page-sub">
          {isFaturamento
            ? 'Integrações, parâmetros de faturamento e dados da empresa'
            : 'Gerencie acessos e permissões do sistema'}
        </p>
      </div>

      <div className="gs-card overflow-hidden">
        <div className="flex border-b border-gray-100">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-3.5 text-sm font-medium transition-colors border-b-2 ${
                tab === t.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'integracoes' && <Integracoes cfg={cfg} save={save} />}
          {tab === 'regras'      && <RegrasNegocio cfg={cfg} save={save} />}
          {tab === 'empresa'     && <Empresa cfg={cfg} save={save} />}
          {tab === 'acesso'      && <Acesso />}
          {tab === 'perfis'      && <PerfisTab />}
          {tab === 'planilha'    && <PlanilhaTab />}
        </div>
      </div>
    </div>
  )
}

// ── Integrações ───────────────────────────────────────────────
function Integracoes({ cfg, save }) {
  const savedValues = {
    asaas_api_key:     cfg?.asaas_api_key     || '',
    asaas_base_url:    cfg?.asaas_base_url    || '',
    anthropic_api_key: cfg?.anthropic_api_key || '',
  }
  const [form, setForm] = useState(savedValues)
  const [showAsaas, setShowAsaas] = useState(false)
  const [showAnth, setShowAnth]   = useState(false)
  const [testing, setTesting]     = useState(false)
  const [testResult, setTestResult] = useState(null)

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      // Only save fields that changed from the last saved state
      const dirtyFields = Object.fromEntries(
        Object.entries(form).filter(([k, v]) => v !== savedValues[k])
      )
      if (Object.keys(dirtyFields).length > 0) {
        await api.put('/settings', dirtyFields)
      }
      const r = await api.post('/settings/test-asaas')
      setTestResult({ ok: true, msg: `Conectado · ${r.data.account_name} · ${r.data.environment}` })
    } catch (e) {
      setTestResult({ ok: false, msg: e?.response?.data?.detail || 'Erro de conexão' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => save.mutate(form)

  return (
    <div className="space-y-5">
      {/* Asaas */}
      <div className="gs-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="gs-section-title">Asaas</h2>
            <p className="text-xs text-gray-400 mt-0.5">Plataforma de cobranças — boletos, Pix e sincronização de status</p>
          </div>
          <StatusBadge ok={cfg?.asaas_configured} />
        </div>

        <div>
          <label className="gs-label block mb-1">Chave da API</label>
          <div className="relative">
            <input
              type={showAsaas ? 'text' : 'password'}
              value={form.asaas_api_key}
              onChange={e => setForm(p => ({ ...p, asaas_api_key: e.target.value }))}
              placeholder="$aact_..."
              className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
            />
            <button type="button" onClick={() => setShowAsaas(v => !v)}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
              {showAsaas ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div>
          <label className="gs-label block mb-1">URL da API</label>
          <input
            type="text"
            value={form.asaas_base_url}
            onChange={e => setForm(p => ({ ...p, asaas_base_url: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">
            Produção: <code>https://api.asaas.com/v3</code> · Sandbox: <code>https://sandbox.asaas.com/api/v3</code>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleTest} disabled={testing}
            className="gs-btn gs-btn-outline gs-btn-sm flex items-center gap-2">
            {testing ? <Loader size={13} className="animate-spin" /> : <Zap size={13} />}
            Testar conexão
          </button>
          {testResult && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${testResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {testResult.ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
              {testResult.msg}
            </div>
          )}
        </div>
      </div>

      {/* Anthropic */}
      <div className="gs-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="gs-section-title">Anthropic · Diagnóstico por IA</h2>
            <p className="text-xs text-gray-400 mt-0.5">Análise automática dos ciclos de faturamento com Claude</p>
          </div>
          <StatusBadge ok={cfg?.anthropic_configured} />
        </div>

        <div>
          <label className="gs-label block mb-1">Chave da API</label>
          <div className="relative">
            <input
              type={showAnth ? 'text' : 'password'}
              value={form.anthropic_api_key}
              onChange={e => setForm(p => ({ ...p, anthropic_api_key: e.target.value }))}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
            />
            <button type="button" onClick={() => setShowAnth(v => !v)}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
              {showAnth ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={save.isPending}
          className="gs-btn gs-btn-primary">
          {save.isPending ? 'Salvando...' : 'Salvar integrações'}
        </button>
      </div>
    </div>
  )
}

const CAT_OPTIONS = ['Anuidade', 'Estoque', 'Suporte']

const CAT_STYLE = {
  Anuidade: { background: '#FFF7ED', color: '#EA580C', borderColor: '#FDBA74' },
  Estoque:  { background: '#EEF2FF', color: '#4338CA', borderColor: '#A5B4FC' },
  Suporte:  { background: '#F3F4F6', color: '#4B5563', borderColor: '#D1D5DB' },
}

// ── Regras de Negócio ─────────────────────────────────────────
function RegrasNegocio({ cfg, save }) {
  const [nextId, setNextId] = useState(100)
  const [form, setForm] = useState({
    cnpj_excluidos:      cfg?.cnpj_excluidos     || '',
    prefixos_excluidos:  cfg?.prefixos_excluidos || 'ANUIDADE',
    cnpj_categorias: (() => {
      try { return JSON.parse(cfg?.cnpj_categorias || '{}') }
      catch { return {} }
    })(),
    parametros_calculo: (() => {
      try { return JSON.parse(cfg?.parametros_calculo || '[]') }
      catch { return [{ key: 'mensageria_valor', label: 'Mensageria', valor: '9.90' }] }
    })(),
  })
  const [resolved, setResolved]   = useState([])
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    const lines = form.cnpj_excluidos
      .split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) { setResolved([]); return }
    const timer = setTimeout(async () => {
      setResolving(true)
      try {
        const r = await api.post('/settings/cnpj-lookup', { cnpjs: lines })
        setResolved(r.data)
      } catch { setResolved([]) }
      finally { setResolving(false) }
    }, 700)
    return () => clearTimeout(timer)
  }, [form.cnpj_excluidos])

  const handleSave = () => {
    const { cnpj_categorias, parametros_calculo, ...rest } = form
    const mensRow = parametros_calculo.find(p => p.key === 'mensageria_valor')
    save.mutate({
      ...rest,
      cnpj_categorias:    JSON.stringify(cnpj_categorias),
      parametros_calculo: JSON.stringify(parametros_calculo),
      mensageria_valor:   mensRow?.valor || '9.90',
    })
  }

  const addParam = () => {
    setNextId(n => n + 1)
    setForm(p => ({
      ...p,
      parametros_calculo: [...p.parametros_calculo, { key: `param_${nextId}`, label: '', valor: '0.00' }],
    }))
  }

  const updateParam = (idx, field, val) =>
    setForm(p => {
      const arr = [...p.parametros_calculo]
      arr[idx] = { ...arr[idx], [field]: val }
      return { ...p, parametros_calculo: arr }
    })

  const removeParam = (idx) =>
    setForm(p => ({ ...p, parametros_calculo: p.parametros_calculo.filter((_, i) => i !== idx) }))

  const setCategoria = (cnpj, val) =>
    setForm(p => ({ ...p, cnpj_categorias: { ...p.cnpj_categorias, [cnpj]: val } }))

  const fmtDoc = (d = '') => {
    if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
    if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
    return d
  }

  const tipoBadge = (cnpj = '') => {
    if (cnpj.length === 14)
      return <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-700">CNPJ</span>
    if (cnpj.length === 11)
      return <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">CPF</span>
    return null
  }

  const fonteBadge = (fonte) => {
    if (!fonte) return <span className="text-[10px] text-gray-400">—</span>
    const cls = fonte === 'Asaas' ? 'bg-emerald-50 text-emerald-600'
              : fonte === 'Itaú'  ? 'bg-orange-50 text-orange-600'
              : 'bg-blue-50 text-blue-600'
    return <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>{fonte}</span>
  }

  return (
    <div className="space-y-5">

      {/* Exclusões */}
      <div className="gs-card p-5 space-y-4">
        <div>
          <h2 className="gs-section-title">Exclusões de faturamento</h2>
          <p className="text-xs text-gray-400 mt-0.5">Clientes que não devem entrar em nenhuma cobrança</p>
        </div>

        {/* CNPJs — textarea + tabela lado a lado */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="gs-label">CNPJs / CPFs excluídos</label>
            {resolving && <span className="flex items-center gap-1 text-xs text-gray-400"><Loader size={11} className="animate-spin" /> buscando nomes…</span>}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
            {/* Textarea — mesma altura da tabela */}
            <div style={{ width: 176, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              <textarea
                value={form.cnpj_excluidos}
                onChange={e => setForm(p => ({ ...p, cnpj_excluidos: e.target.value }))}
                style={{ flex: 1, minHeight: 80 }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono resize-none"
                placeholder="22222222222&#10;24152616000146"
              />
              <p className="text-[11px] text-gray-400 mt-1">Um por linha, sem pontuação → aparece na tabela ao lado</p>
            </div>

            {/* Tabela de nomes */}
            {resolved.length > 0 ? (
              <div style={{ flex: 1 }} className="overflow-hidden rounded-lg border border-gray-100 flex flex-col">
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Categoria</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Tipo</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Documento</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Nome</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Fonte</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {resolved.map((r, i) => {
                        const cat = form.cnpj_categorias[r.cnpj] || ''
                        return (
                          <tr key={i} className="hover:bg-gray-50/50">
                            <td className="px-3 py-1.5">
                              <select
                                value={cat}
                                onChange={e => setCategoria(r.cnpj, e.target.value)}
                                style={cat ? { ...CAT_STYLE[cat], borderWidth: 1, borderStyle: 'solid', fontWeight: 600 } : {}}
                                className="text-[11px] border border-gray-200 rounded-md px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
                              >
                                <option value="">—</option>
                                {CAT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-1.5">{tipoBadge(r.cnpj)}</td>
                            <td className="px-3 py-1.5 font-mono text-gray-600 whitespace-nowrap">{fmtDoc(r.cnpj)}</td>
                            <td className="px-3 py-1.5 text-gray-800 max-w-[200px] truncate" title={r.nome || ''}>
                              {r.nome || <span className="text-gray-400 italic">não encontrado</span>}
                            </td>
                            <td className="px-3 py-1.5">{fonteBadge(r.fonte)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="px-3 py-2 text-[10px] text-gray-400 border-t border-gray-100 flex-shrink-0">
                  CNPJ (14 dígitos) = empresa/conta interna · CPF (11 dígitos) = pessoa física
                </p>
              </div>
            ) : (
              !resolving && form.cnpj_excluidos.trim() && (
                <div style={{ flex: 1 }} className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
                  Nenhum registro encontrado nas bases
                </div>
              )
            )}
          </div>
        </div>

        <div>
          <label className="gs-label block mb-1">Prefixos de nome excluídos</label>
          <textarea
            rows={3}
            value={form.prefixos_excluidos}
            onChange={e => setForm(p => ({ ...p, prefixos_excluidos: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono resize-none"
            placeholder="ANUIDADE"
          />
          <p className="text-xs text-gray-400 mt-1">Um prefixo por linha — clientes cujo nome começa com esses termos (maiúsc.) são excluídos automaticamente.</p>
        </div>
      </div>

      {/* Parâmetros de cálculo — tabela extensível */}
      <div className="gs-card p-5 space-y-3">
        <div>
          <h2 className="gs-section-title">Parâmetros de cálculo</h2>
          <p className="text-xs text-gray-400 mt-0.5">Pacotes Smart e seus valores unitários de cobrança</p>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Nome do pacote</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-40">Valor unitário (R$)</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {form.parametros_calculo.map((p, i) => (
                <tr key={p.key} className="hover:bg-gray-50/40">
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={p.label}
                      onChange={e => updateParam(i, 'label', e.target.value)}
                      placeholder="Ex: Mensageria"
                      className="w-full px-2 py-1 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="relative w-36">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={p.valor}
                        onChange={e => updateParam(i, 'valor', e.target.value)}
                        className="w-full pl-8 pr-2 py-1 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => removeParam(i)}
                      className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Remover"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={addParam}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Adicionar parâmetro
        </button>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button onClick={handleSave} disabled={save.isPending}
            className="gs-btn gs-btn-primary">
            {save.isPending ? 'Salvando...' : 'Salvar regras'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Empresa ───────────────────────────────────────────────────
function Empresa({ cfg, save }) {
  const [form, setForm] = useState({
    empresa_nome:     cfg?.empresa_nome     || '',
    empresa_cnpj:     cfg?.empresa_cnpj     || '',
    empresa_ie:       cfg?.empresa_ie       || '',
    empresa_endereco: cfg?.empresa_endereco || '',
    empresa_email:    cfg?.empresa_email    || '',
    empresa_telefone: cfg?.empresa_telefone || '',
  })
  const [logo, setLogo] = useState(cfg?.empresa_logo || null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))
  const handleSave = () => save.mutate({ ...form, empresa_logo: logo })

  const readFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (ev) => setLogo(ev.target.result)
    reader.readAsDataURL(file)
  }

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false)
    readFile(e.dataTransfer.files[0])
  }

  return (
    <div className="space-y-5">

      {/* Dados da empresa — caixa única */}
      <div className="gs-card p-5 space-y-5">
        <h2 className="gs-section-title">Dados da empresa</h2>

        {/* Upload de logo — topo da caixa, full width */}
        <div>
          <label className="gs-label block mb-1">Logo da empresa</label>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => readFile(e.target.files[0])} />
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className="relative cursor-pointer rounded-lg border-2 flex items-center justify-center overflow-hidden"
            style={{
              height: 120,
              borderColor: dragging ? '#3CB54A' : (logo ? '#E5E7EB' : '#D1FAE5'),
              borderStyle: logo ? 'solid' : 'dashed',
              background: dragging ? '#F0FDF4' : (logo ? '#000' : '#F9FFFE'),
              transition: 'all 0.15s',
            }}
          >
            {logo ? (
              <>
                <img src={logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(0,0,0,0.55)' }}>
                  <span className="text-white text-xs font-semibold">Clique para trocar</span>
                </div>
              </>
            ) : (
              <div className="text-center pointer-events-none">
                <p className="text-xs font-semibold text-green-700">Clique ou arraste a logo</p>
                <p className="text-[10px] text-gray-400 mt-0.5">PNG, JPG ou SVG</p>
              </div>
            )}
          </div>
          {logo && (
            <button onClick={() => setLogo(null)}
              className="mt-1 text-[10px] text-red-400 hover:text-red-600 underline">
              Remover logo
            </button>
          )}
        </div>

        {/* Razão Social — abaixo da logo */}
        <div>
          <label className="gs-label block mb-1">Razão social</label>
          <input type="text" value={form.empresa_nome} onChange={set('empresa_nome')}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="gs-label block mb-1">CNPJ</label>
            <input type="text" value={form.empresa_cnpj} onChange={set('empresa_cnpj')}
              placeholder="00.000.000/0001-00"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono" />
          </div>
          <div>
            <label className="gs-label block mb-1">Inscrição Estadual (IE)</label>
            <input type="text" value={form.empresa_ie} onChange={set('empresa_ie')}
              placeholder="Isento ou número da IE"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono" />
          </div>
        </div>

        <div>
          <label className="gs-label block mb-1">Endereço completo</label>
          <input type="text" value={form.empresa_endereco} onChange={set('empresa_endereco')}
            placeholder="Rua, número, complemento, bairro, cidade/UF - CEP"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="gs-label block mb-1">E-mail</label>
            <input type="email" value={form.empresa_email} onChange={set('empresa_email')}
              placeholder="financeiro@empresa.com.br"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="gs-label block mb-1">Telefone</label>
            <input type="text" value={form.empresa_telefone} onChange={set('empresa_telefone')}
              placeholder="(11) 99999-9999"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Sistema */}
      <div className="gs-card p-5">
        <h2 className="gs-section-title mb-3">Informações do sistema</h2>
        <div className="space-y-2 text-sm text-gray-600">
          {[
            ['Versão', '1.2.0'],
            ['Backend', 'FastAPI · Python 3.12'],
            ['Banco de dados', 'PostgreSQL 16'],
            ['Frontend', 'React 18 · Vite · Tailwind CSS'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <span className="text-gray-400 w-32 flex-shrink-0">{k}</span>
              <span className="font-mono text-xs">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={save.isPending}
          className="gs-btn gs-btn-primary">
          {save.isPending ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

// ── Acesso ────────────────────────────────────────────────────
const ROLES = [
  { value: 'admin',           label: 'Administrador' },
  { value: 'gestor',          label: 'Gestor' },
  { value: 'contas_receber',  label: 'Contas a Receber' },
  { value: 'suporte_tecnico', label: 'Suporte Técnico' },
  { value: 'logistica',       label: 'Logística' },
  { value: 'backoffice',      label: 'Backoffice' },
  { value: 'comercial',       label: 'Comercial' },
]

const PERMS = [
  ['can_edit_billing',       'Editar faturamento'],
  ['can_approve_billing',    'Aprovar faturamento'],
  ['can_view_dashboard',     'Ver dashboard'],
  ['can_manage_users',       'Gerenciar usuários'],
  ['can_view_contestacao',   'Ver contestação'],
  ['can_view_comissao',      'Ver comissionamento'],
  ['can_approve_adjustment', 'Aprovar ajustes'],
]

function Acesso() {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)
  const qc = useQueryClient()

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => authApi.users().then(r => r.data),
  })

  const deactivate = useMutation({
    mutationFn: (id) => authApi.deleteUser(id),
    onSuccess: () => { toast.success('Usuário desativado'); qc.invalidateQueries({ queryKey: ['users'] }) },
  })

  return (
    <div className="space-y-5">
      <div className="gs-card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="gs-section-title">Usuários</h2>
            <p className="text-xs text-gray-400 mt-0.5">Gerencie acessos e permissões do sistema</p>
          </div>
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="gs-btn gs-btn-dark flex items-center gap-2">
            <Plus size={14} /> Novo usuário
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="gs-th">Nome</th>
                <th className="gs-th">E-mail</th>
                <th className="gs-th">Perfil</th>
                <th className="gs-th">Status</th>
                <th className="gs-th">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const initials  = u.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
                return (
                  <tr key={u.id} className="gs-tr border-t border-gray-100">
                    <td className="gs-td">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: '#EEF2FF', color: '#2563EB' }}>
                          {initials}
                        </div>
                        <span className="font-medium text-gray-900">{u.name}</span>
                      </div>
                    </td>
                    <td className="gs-td text-gray-500">{u.email}</td>
                    <td className="gs-td">
                      <span className="gs-badge gs-badge-blue">{u.role_label}</span>
                    </td>
                    <td className="gs-td">
                      <span className={u.is_active ? 'gs-badge gs-badge-green' : 'gs-badge gs-badge-red'}>
                        {u.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="gs-td">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(u); setShowForm(true) }}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                          <Edit2 size={14} />
                        </button>
                        {u.is_active && (
                          <button onClick={() => deactivate.mutate(u.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                            <Power size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Perfis */}
      <div className="gs-card p-5">
        <h2 className="gs-section-title mb-3">Perfis de acesso</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs">
              <th className="text-left pb-2 pr-4">Perfil</th>
              <th className="text-left pb-2">Permissões padrão</th>
            </tr>
          </thead>
          <tbody className="text-gray-600">
            {[
              ['Administrador',   'admin',           'Acesso completo a todas as funcionalidades do sistema.'],
              ['Gestor',          'gestor',          'Acesso gerencial — aprovação de faturamento, relatórios e ajustes.'],
              ['Contas a Receber','contas_receber',  'Operações de faturamento, ajustes e exportações.'],
              ['Backoffice',      'backoffice',      'Operações internas — faturamento, ajustes e relatórios.'],
              ['Comercial',       'comercial',       'Painel comercial — comissionamento e visão de resultados.'],
              ['Logística',       'logistica',       'Gestão de logística e upload de planilhas.'],
              ['Suporte Técnico', 'suporte_tecnico', 'Acesso somente à contestação e logística.'],
            ].map(([label, , desc]) => (
              <tr key={label} className="border-t border-gray-50">
                <td className="py-2 pr-4 font-medium">{label}</td>
                <td className="py-2 text-xs text-gray-500">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <UserFormModal
          user={editing}
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['users'] }) }}
        />
      )}
    </div>
  )
}

function UserFormModal({ user, onClose, onSuccess }) {
  const isEdit = !!user
  const [form, setForm] = useState(user ? {
    name: user.name, role: user.role, is_active: user.is_active,
    ...Object.fromEntries(PERMS.map(([k]) => [k, user.permissions?.[k] ?? null]))
  } : {
    name: '', email: '', password: '', role: 'contas_receber',
    ...Object.fromEntries(PERMS.map(([k]) => [k, null]))
  })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      if (isEdit) { await authApi.updateUser(user.id, form); toast.success('Usuário atualizado!') }
      else        { await authApi.createUser(form);          toast.success('Usuário criado!') }
      onSuccess()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Editar Usuário' : 'Novo Usuário'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Nome">
            <input value={form.name} onChange={e => set('name', e.target.value)} required className={INPUT} />
          </Field>
          {!isEdit && <>
            <Field label="E-mail">
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required className={INPUT} />
            </Field>
            <Field label="Senha inicial">
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} className={INPUT} />
            </Field>
          </>}
          <Field label="Perfil">
            <select value={form.role} onChange={e => set('role', e.target.value)} className={INPUT}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Permissões individuais <span className="text-gray-400 font-normal">(sobrescrevem o perfil)</span>
            </p>
            <div className="space-y-2">
              {PERMS.map(([key, label]) => (
                <label key={key} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-700">{label}</span>
                  <select value={form[key] === null ? 'null' : String(form[key])}
                    onChange={e => set(key, e.target.value === 'null' ? null : e.target.value === 'true')}
                    className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="null">Padrão do perfil</option>
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="flex-1 gs-btn gs-btn-dark justify-center">
              {loading ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

const INPUT = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"

// ══════════════════════════════════════════════════════════════
// PERFIS & PERMISSÕES
// ══════════════════════════════════════════════════════════════

const ROLE_COLORS = {
  admin:           'bg-gray-800 text-white',
  gestor:          'bg-green-100 text-green-700',
  contas_receber:  'bg-blue-100 text-blue-700',
  suporte_tecnico: 'bg-orange-100 text-orange-700',
  logistica:       'bg-indigo-100 text-indigo-700',
  backoffice:      'bg-gray-100 text-gray-700',
  comercial:       'bg-amber-100 text-amber-700',
}

const CUSTOM_COLORS = [
  { value: 'blue',   label: 'Azul',     cls: 'bg-blue-100 text-blue-700' },
  { value: 'green',  label: 'Verde',    cls: 'bg-green-100 text-green-700' },
  { value: 'teal',   label: 'Teal',     cls: 'bg-teal-100 text-teal-700' },
  { value: 'orange', label: 'Laranja',  cls: 'bg-orange-100 text-orange-700' },
  { value: 'red',    label: 'Vermelho', cls: 'bg-red-100 text-red-700' },
  { value: 'pink',   label: 'Rosa',     cls: 'bg-pink-100 text-pink-700' },
  { value: 'indigo', label: 'Índigo',   cls: 'bg-indigo-100 text-indigo-700' },
  { value: 'gray',   label: 'Cinza',    cls: 'bg-gray-100 text-gray-700' },
]
const COLOR_CLASSES = Object.fromEntries(CUSTOM_COLORS.map(c => [c.value, c.cls]))

const PERM_SECTIONS = [
  { key: 'MÓDULOS', perms: [
    ['can_view_dashboard',     'Dashboard / Painel'],
    ['can_view_faturamento',   'Faturamento'],
    ['can_edit_billing',       'Editar faturamento'],
    ['can_view_contestacao',   'Contestação'],
    ['can_view_comissao',      'Comissionamento'],
    ['can_view_logistica',     'Logística'],
    ['can_view_controladoria', 'Controladoria'],
    ['can_manage_users',       'Usuários'],
    ['can_view_configuracoes', 'Configurações'],
  ]},
  { key: 'AÇÕES', perms: [
    ['can_approve_billing',   'Aprovar faturamento'],
    ['can_create_adjustment', 'Criar ajustes'],
    ['can_approve_adjustment','Aprovar ajustes (acima de R$3.000)'],
    ['can_upload_files',      'Upload de planilhas'],
    ['can_sync_asaas',        'Sincronizar Asaas'],
  ]},
  { key: 'DADOS SENSÍVEIS', perms: [
    ['can_view_financial_values','Ver valores financeiros'],
  ]},
  { key: 'EXPORTAÇÃO', perms: [
    ['can_export_excel','Exportar Excel'],
    ['can_export_pdf',  'Exportar PDF'],
  ]},
  { key: 'CONTROLADORIA (abas do dashboard externo)', perms: [
    ['can_view_ctrl_dre',         'Aba: DRE'],
    ['can_view_ctrl_fluxo_caixa', 'Aba: Fluxo de Caixa'],
    ['can_view_ctrl_balanco',     'Aba: Balanço Patrimonial'],
    ['can_view_ctrl_indicadores', 'Aba: Indicadores'],
  ]},
]

function PerfisTab() {
  const [editingRole, setEditingRole] = useState(null)
  const [showNewRole, setShowNewRole] = useState(false)
  const qc = useQueryClient()

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get('/settings/roles').then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (slug) => api.delete(`/settings/roles/custom/${slug}`),
    onSuccess: () => { toast.success('Perfil removido'); qc.invalidateQueries({ queryKey: ['roles'] }) },
    onError: (err) => toast.error(err.response?.data?.detail || 'Erro ao remover'),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-32">
      <Loader size={18} className="animate-spin text-gray-400" />
    </div>
  )

  const systemRoles = roles.filter(r => !r.is_custom)
  const customRoles = roles.filter(r => r.is_custom)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="gs-section-title">Perfis de acesso</h2>
          <p className="text-xs text-gray-400 mt-0.5">Gerencie as permissões de cada perfil do sistema</p>
        </div>
        <button onClick={() => setShowNewRole(true)}
          className="gs-btn gs-btn-dark flex items-center gap-2">
          <Plus size={14} /> Novo perfil
        </button>
      </div>

      {/* Perfis do sistema */}
      <div>
        <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Perfis do sistema</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {systemRoles.map(role => (
            <RoleCard key={role.role} role={role} onEdit={() => setEditingRole(role)} />
          ))}
        </div>
      </div>

      {/* Perfis personalizados */}
      {customRoles.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Perfis personalizados</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {customRoles.map(role => (
              <RoleCard key={role.role} role={role}
                onEdit={() => setEditingRole(role)}
                onDelete={() => {
                  if (window.confirm(`Remover o perfil "${role.label}"?`)) {
                    deleteMutation.mutate(role.role)
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {showNewRole && (
        <NewRoleModal
          onClose={() => setShowNewRole(false)}
          onSuccess={() => { setShowNewRole(false); qc.invalidateQueries({ queryKey: ['roles'] }) }}
        />
      )}

      {editingRole && (
        <EditRoleModal
          role={editingRole}
          onClose={() => setEditingRole(null)}
          onSuccess={() => { setEditingRole(null); qc.invalidateQueries({ queryKey: ['roles'] }) }}
        />
      )}
    </div>
  )
}

function RoleCard({ role, onEdit, onDelete }) {
  const colorClass = role.is_custom
    ? (COLOR_CLASSES[role.color] || 'bg-gray-100 text-gray-700')
    : (ROLE_COLORS[role.role] || 'bg-gray-100 text-gray-700')

  return (
    <div className="gs-card p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>
            {role.label}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide ${
            role.is_custom ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
          }`}>
            {role.is_custom ? 'CUSTOM' : 'SISTEMA'}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-sm font-bold text-green-600">{role.total_enabled}</span>
          <span className="text-xs text-gray-400">/{role.total}</span>
        </div>
      </div>

      <p className="text-xs text-gray-500 line-clamp-2 flex-1">{role.description || '—'}</p>

      <div className="flex gap-2 pt-1 border-t border-gray-100">
        <button onClick={onEdit}
          className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
          <Edit2 size={12} /> Editar
        </button>
        {role.is_custom ? (
          <button onClick={onDelete}
            className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center gap-1">
            <Trash2 size={12} /> Excluir
          </button>
        ) : (
          <button disabled
            className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-gray-200 text-gray-400 opacity-40 cursor-not-allowed">
            Duplicar
          </button>
        )}
      </div>
    </div>
  )
}

function NewRoleModal({ onClose, onSuccess }) {
  const [label, setLabel]   = useState('')
  const [desc, setDesc]     = useState('')
  const [color, setColor]   = useState('blue')
  const [perms, setPerms]   = useState(
    Object.fromEntries(PERM_SECTIONS.flatMap(s => s.perms).map(([k]) => [k, false]))
  )
  const [open, setOpen]     = useState({ MÓDULOS: true, AÇÕES: false, 'DADOS SENSÍVEIS': false, EXPORTAÇÃO: false })
  const [loading, setLoading] = useState(false)

  const togglePerm = (key) => setPerms(p => ({ ...p, [key]: !p[key] }))
  const markAll = (sectionPerms, value) => setPerms(p => {
    const next = { ...p }
    sectionPerms.forEach(([k]) => { next[k] = value })
    return next
  })

  const handleSave = async () => {
    if (!label.trim()) return toast.error('Informe o nome do perfil')
    setLoading(true)
    try {
      await api.post('/settings/roles/custom', { label, description: desc, color, permissions: perms })
      toast.success('Perfil criado!')
      onSuccess()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao criar perfil')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <Plus size={16} className="text-green-500" />
            <h2 className="font-semibold text-gray-900">Novo perfil personalizado</h2>
          </div>
          <p className="text-xs text-gray-400">Crie um perfil com permissões específicas para atribuir a usuários.</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nome do perfil *</label>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex: Analista Financeiro"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cor</label>
              <select value={color} onChange={e => setColor(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none">
                {CUSTOM_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {label && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Preview:</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COLOR_CLASSES[color]}`}>{label}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-600 tracking-wide">CUSTOM</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Descrição</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none resize-none" />
          </div>

          {PERM_SECTIONS.map(section => (
            <div key={section.key} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                <button onClick={() => setOpen(o => ({ ...o, [section.key]: !o[section.key] }))}
                  className="flex items-center gap-2 text-[10px] font-semibold tracking-widest text-gray-400 uppercase">
                  {open[section.key] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {section.key}
                </button>
                <div className="flex gap-3">
                  <button onClick={() => markAll(section.perms, true)} className="text-xs text-blue-500 hover:underline">Marcar tudo</button>
                  <button onClick={() => markAll(section.perms, false)} className="text-xs text-blue-500 hover:underline">Desmarcar</button>
                </div>
              </div>
              {open[section.key] && (
                <div className="divide-y divide-gray-50">
                  {section.perms.map(([key, lbl]) => (
                    <label key={key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={!!perms[key]} onChange={() => togglePerm(key)}
                        className="accent-green-600 w-4 h-4 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{lbl}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: loading ? '#9ca3af' : '#3CB54A' }}>
            {loading ? 'Criando...' : 'Criar perfil'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditRoleModal({ role, onClose, onSuccess }) {
  const [perms, setPerms]   = useState({ ...role.permissions })
  const [desc, setDesc]     = useState(role.description || '')
  const [label, setLabel]   = useState(role.label || '')
  const [color, setColor]   = useState(role.color || 'blue')
  const [open, setOpen]     = useState({ MÓDULOS: true, AÇÕES: true, 'DADOS SENSÍVEIS': true, EXPORTAÇÃO: true })
  const [loading, setLoading] = useState(false)

  const togglePerm = (key) => setPerms(p => ({ ...p, [key]: !p[key] }))

  const markAll = (sectionPerms, value) => {
    setPerms(p => {
      const next = { ...p }
      sectionPerms.forEach(([k]) => { next[k] = value })
      return next
    })
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      if (role.is_custom) {
        await api.put(`/settings/roles/custom/${role.role}`, { label, description: desc, color, permissions: perms })
      } else {
        await api.put(`/settings/roles/${role.role}`, { permissions: perms, description: desc })
      }
      toast.success('Permissões salvas!')
      onSuccess()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <Shield size={16} className="text-gray-500" />
            <h2 className="font-semibold text-gray-900">Editar perfil: {role.label}</h2>
          </div>
          <p className="text-xs text-gray-400">
            {role.is_custom ? 'Perfil personalizado — você pode alterar o nome e as permissões.' : 'Perfil do sistema — o nome não pode ser alterado.'}
          </p>
        </div>

        <div className="p-5 space-y-5">
          {role.is_custom && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome do perfil</label>
                <input value={label} onChange={e => setLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cor</label>
                <select value={color} onChange={e => setColor(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none">
                  {CUSTOM_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Descrição</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none resize-none" />
          </div>

          {PERM_SECTIONS.map(section => (
            <div key={section.key} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                <button onClick={() => setOpen(o => ({ ...o, [section.key]: !o[section.key] }))}
                  className="flex items-center gap-2 text-[10px] font-semibold tracking-widest text-gray-400 uppercase">
                  {open[section.key] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {section.key}
                </button>
                <div className="flex gap-3">
                  <button onClick={() => markAll(section.perms, true)}
                    className="text-xs text-blue-500 hover:underline">Marcar tudo</button>
                  <button onClick={() => markAll(section.perms, false)}
                    className="text-xs text-blue-500 hover:underline">Desmarcar</button>
                </div>
              </div>
              {open[section.key] && (
                <div className="divide-y divide-gray-50">
                  {section.perms.map(([key, lbl]) => (
                    <label key={key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={!!perms[key]} onChange={() => togglePerm(key)}
                        className="accent-green-600 w-4 h-4 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{lbl}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: loading ? '#9ca3af' : '#3CB54A' }}>
            {loading ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente auxiliar ───────────────────────────────────────
function StatusBadge({ ok }) {
  if (ok) return (
    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
      <CheckCircle size={11} /> Configurado
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
      <XCircle size={11} /> Não configurado
    </span>
  )
}


// ── Planilha Google ───────────────────────────────────────────
function PlanilhaTab() {
  const qc = useQueryClient()
  const { data: cfg, isLoading } = useQuery({
    queryKey: ['sheets-config'],
    queryFn: () => api.get('/sheets/config').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const [spreadsheetId, setSpreadsheetId] = useState('')
  const [serviceJson, setServiceJson] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    if (cfg) setSpreadsheetId(cfg.spreadsheet_id || '')
  }, [cfg])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/sheets/config', {
        spreadsheet_id: spreadsheetId,
        service_account_json: serviceJson.trim() || null,
      })
      toast.success('Configurações salvas!')
      setServiceJson('')
      qc.invalidateQueries({ queryKey: ['sheets-config'] })
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await api.post('/sheets/test-connection')
      setTestResult({ ok: true, msg: `Conectado: "${r.data.title}" — ${r.data.sheets.length} abas` })
    } catch (e) {
      setTestResult({ ok: false, msg: e.response?.data?.detail || 'Falha na conexão' })
    } finally { setTesting(false) }
  }

  if (isLoading) return <div className="flex justify-center py-8"><Loader size={16} className="animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="gs-section-title mb-1">Google Sheets — Indicadores Mensais</h3>
        <p className="text-xs text-gray-400">Configure a planilha para sincronização bidirecional com a tela de Indicadores.</p>
      </div>

      {/* Spreadsheet ID */}
      <div>
        <label className="gs-label">ID da Planilha</label>
        <input
          value={spreadsheetId}
          onChange={e => setSpreadsheetId(e.target.value)}
          placeholder="Ex: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          className="gs-input w-full"
        />
        <p className="text-xs text-gray-400 mt-1">
          O ID fica na URL da planilha: docs.google.com/spreadsheets/d/<strong>[ID]</strong>/edit
        </p>
      </div>

      {/* Service Account JSON */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <label className="gs-label mb-0">Service Account (JSON)</label>
          {cfg?.has_service_account && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Configurada</span>
          )}
        </div>
        <textarea
          value={serviceJson}
          onChange={e => setServiceJson(e.target.value)}
          rows={8}
          placeholder={cfg?.has_service_account
            ? 'Deixe em branco para manter a service account atual. Cole o JSON novo para substituir.'
            : 'Cole aqui o conteúdo do arquivo JSON da service account do Google Cloud...'}
          className="gs-input w-full font-mono text-xs resize-none"
          style={{ borderRadius: 8 }}
        />
        <p className="text-xs text-gray-400 mt-1">
          Crie a service account em <strong>console.cloud.google.com</strong> → IAM → Service Accounts, gere uma chave JSON e cole aqui.
          Depois compartilhe a planilha com o e-mail da service account com permissão de Editor.
        </p>
      </div>

      {/* Resultado do teste */}
      {testResult && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: testResult.ok ? '#f0fdf4' : '#fef2f2',
          color: testResult.ok ? '#15803d' : '#dc2626',
          border: `1px solid ${testResult.ok ? '#bbf7d0' : '#fecaca'}`,
        }}>
          {testResult.ok ? '✓' : '✗'} {testResult.msg}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={handleTest} disabled={testing || !spreadsheetId} className="gs-btn gs-btn-outline gs-btn-sm">
          {testing ? <Loader size={12} className="animate-spin" /> : <Zap size={12} />}
          Testar conexão
        </button>
        <button onClick={handleSave} disabled={saving} className="gs-btn gs-btn-primary gs-btn-sm">
          <Key size={12} />
          {saving ? 'Salvando…' : 'Salvar configuração'}
        </button>
      </div>
    </div>
  )
}
