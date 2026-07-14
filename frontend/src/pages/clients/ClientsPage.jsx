import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clientsApi } from '../../services/api'
import toast from 'react-hot-toast'
import {
  Search, Upload, Download, Building2, Pencil, X, Check,
  Plus, Trash2, ChevronLeft, ChevronRight, ChevronDown, Users, Landmark, Phone, Mail
} from 'lucide-react'

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
const TIPO_PIX = ['cpf','cnpj','email','telefone','aleatoria']

// ── Formatação ─────────────────────────────────────────────────────────────
const fmtCnpj = (v = '') => {
  const d = v.replace(/\D/g, '')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return v
}
const fmtCep = (v = '') => v.replace(/\D/g,'').replace(/(\d{5})(\d{3})/,'$1-$2')
const fmtTelefone = (v = '') => {
  const d = v.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return v
}

// ── Input padronizado ──────────────────────────────────────────────────────
function Field({ label, value, onChange, readOnly, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {readOnly
        ? <div className="gs-input bg-gray-50 text-gray-500 cursor-not-allowed">{value || '—'}</div>
        : <input
            type={type}
            className="gs-input w-full"
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
          />
      }
    </div>
  )
}

// ── Modal de edição de cliente ─────────────────────────────────────────────
function EditModal({ profile, banks, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    telefone:    profile.telefone    || '',
    email:       profile.email       || '',
    logradouro:  profile.logradouro  || '',
    numero:      profile.numero      || '',
    complemento: profile.complemento || '',
    bairro:      profile.bairro      || '',
    cep:         profile.cep         || '',
    cidade:      profile.cidade      || '',
    estado:      profile.estado      || '',
    banco_id:    profile.banco_id    || 0,
  })

  const mut = useMutation({
    mutationFn: () => clientsApi.update(profile.id_smart, {
      ...form,
      banco_id: form.banco_id || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente atualizado')
      onClose()
    },
    onError: () => toast.error('Erro ao salvar'),
  })

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">{profile.nome || profile.id_smart}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{fmtCnpj(profile.cnpj || '')} · {profile.id_smart}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {/* Contato */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Contato</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefone" value={form.telefone} onChange={set('telefone')} placeholder="(11) 99999-9999" />
              <Field label="E-mail" value={form.email} onChange={set('email')} placeholder="contato@empresa.com.br" type="email" />
            </div>
          </div>

          {/* Endereço */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Endereço</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Logradouro" value={form.logradouro} onChange={set('logradouro')} placeholder="Rua, Av., Alameda..." />
              </div>
              <Field label="Número" value={form.numero} onChange={set('numero')} placeholder="123" />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Complemento" value={form.complemento} onChange={set('complemento')} placeholder="Sala 5, Bloco A..." />
              <Field label="Bairro" value={form.bairro} onChange={set('bairro')} placeholder="Centro" />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Field label="CEP" value={fmtCep(form.cep)} onChange={v => set('cep')(v.replace(/\D/g,''))} placeholder="00000-000" />
              <div className="col-span-1">
                <Field label="Cidade" value={form.cidade} onChange={set('cidade')} placeholder="São Paulo" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                <select className="gs-select w-full" value={form.estado} onChange={e => set('estado')(e.target.value)}>
                  <option value="">—</option>
                  {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Banco */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Banco / Faturamento</p>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Banco de destino do boleto</label>
              <select className="gs-input w-full" value={form.banco_id || 0} onChange={e => set('banco_id')(Number(e.target.value))}>
                <option value={0}>— Sem banco definido —</option>
                {banks.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-100">
          <button onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="gs-btn gs-btn-dark">
            <Check size={14} />
            {mut.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de bancos ────────────────────────────────────────────────────────
function BanksModal({ onClose }) {
  const qc = useQueryClient()
  const { data: banks = [] } = useQuery({ queryKey: ['banks'], queryFn: () => clientsApi.banks().then(r => r.data) })
  const [creating, setCreating] = useState(false)
  const [editing, setEditing]   = useState(null) // bank object
  const emptyForm = { nome:'', agencia:'', conta:'', digito:'', tipo_chave_pix:'', chave_pix:'' }
  const [form, setForm] = useState(emptyForm)

  const createMut = useMutation({
    mutationFn: () => clientsApi.createBank(form),
    onSuccess: () => { qc.invalidateQueries({queryKey:['banks']}); qc.invalidateQueries({queryKey:['clients']}); setCreating(false); setForm(emptyForm); toast.success('Banco criado') },
    onError: (e) => toast.error(e.response?.data?.detail || 'Erro ao criar'),
  })
  const updateMut = useMutation({
    mutationFn: () => clientsApi.updateBank(editing.id, form),
    onSuccess: () => { qc.invalidateQueries({queryKey:['banks']}); qc.invalidateQueries({queryKey:['clients']}); setEditing(null); setForm(emptyForm); toast.success('Banco atualizado') },
    onError: () => toast.error('Erro ao atualizar'),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => clientsApi.deleteBank(id),
    onSuccess: () => { qc.invalidateQueries({queryKey:['banks']}); qc.invalidateQueries({queryKey:['clients']}); toast.success('Banco removido') },
    onError: (e) => toast.error(e.response?.data?.detail || 'Banco em uso'),
  })

  const startEdit = (b) => { setEditing(b); setForm({ nome:b.nome, agencia:b.agencia||'', conta:b.conta||'', digito:b.digito||'', tipo_chave_pix:b.tipo_chave_pix||'', chave_pix:b.chave_pix||'' }); setCreating(false) }
  const startCreate = () => { setEditing(null); setForm(emptyForm); setCreating(true) }
  const cancel = () => { setCreating(false); setEditing(null); setForm(emptyForm) }
  const set = (k) => (v) => setForm(f => ({...f,[k]:v}))

  const BankForm = (
    <div className="border rounded-lg p-4 bg-gray-50 space-y-3 mt-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Nome da instituição *</label>
          <input className="gs-input w-full" value={form.nome} onChange={e=>set('nome')(e.target.value)} placeholder="Ex: Itaú, Asaas, Bradesco" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Agência</label>
          <input className="gs-input w-full" value={form.agencia} onChange={e=>set('agencia')(e.target.value)} placeholder="0000" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Conta</label>
            <input className="gs-input w-full" value={form.conta} onChange={e=>set('conta')(e.target.value)} placeholder="00000000" />
          </div>
          <div className="w-16">
            <label className="block text-xs font-medium text-gray-500 mb-1">Dígito</label>
            <input className="gs-input w-full" value={form.digito} onChange={e=>set('digito')(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tipo da chave Pix</label>
          <select className="gs-select w-full" value={form.tipo_chave_pix} onChange={e=>set('tipo_chave_pix')(e.target.value)}>
            <option value="">— Sem Pix —</option>
            {TIPO_PIX.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Chave Pix</label>
          <input className="gs-input w-full" value={form.chave_pix} onChange={e=>set('chave_pix')(e.target.value)} placeholder="Chave" disabled={!form.tipo_chave_pix} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={cancel}
          className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
        <button
          onClick={() => editing ? updateMut.mutate() : createMut.mutate()}
          disabled={!form.nome || createMut.isPending || updateMut.isPending}
          className="gs-btn gs-btn-dark gs-btn-sm flex items-center gap-1"
        >
          <Check size={12} /> {editing ? 'Salvar' : 'Criar banco'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Gerenciar Bancos</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5">
          {banks.length === 0 && !creating && (
            <p className="text-sm text-gray-400 text-center py-4">Nenhum banco cadastrado</p>
          )}
          {banks.map(b => (
            <div key={b.id}>
              <div className="flex items-center justify-between py-2.5 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{b.nome}</p>
                  <p className="text-xs text-gray-400">
                    {[b.agencia && `Ag ${b.agencia}`, b.conta && `C/C ${b.conta}${b.digito?'-'+b.digito:''}`, b.chave_pix && `Pix: ${b.chave_pix}`].filter(Boolean).join(' · ') || 'Sem dados bancários'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(b)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><Pencil size={13} /></button>
                  <button onClick={() => { if(confirm(`Remover "${b.nome}"?`)) deleteMut.mutate(b.id) }} className="p-1.5 rounded hover:bg-red-50 text-red-400"><Trash2 size={13} /></button>
                </div>
              </div>
              {editing?.id === b.id && BankForm}
            </div>
          ))}
          {creating && BankForm}
        </div>

        <div className="p-4 border-t">
          {!creating && !editing && (
            <button onClick={startCreate} className="gs-btn gs-btn-outline w-full justify-center">
              <Plus size={14} /> Novo banco
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────
export default function ClientsPage() {
  const qc      = useQueryClient()
  const fileRef = useRef(null)
  const menuRef = useRef(null)

  const [page,      setPage]      = useState(1)
  const [search,    setSearch]    = useState('')
  const [editing,   setEditing]   = useState(null)
  const [showBanks, setShowBanks] = useState(false)
  const [showMenu,  setShowMenu]  = useState(false)

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: banksData = [] } = useQuery({
    queryKey: ['banks'],
    queryFn: () => clientsApi.banks().then(r => r.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['clients', page, search],
    queryFn: () => clientsApi.list({ page, limit: 50, search }).then(r => r.data),
    placeholderData: (previousData) => previousData,
  })

  const handleExport = async () => {
    setShowMenu(false)
    try {
      const res = await clientsApi.export()
      const url = URL.createObjectURL(new Blob([res.data]))
      const a   = document.createElement('a')
      a.href     = url
      a.download = 'clientes.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erro ao exportar planilha')
    }
  }

  const importMut = useMutation({
    mutationFn: (fd) => clientsApi.import(fd),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      const { created, updated, skipped } = res.data
      toast.success(`Importado: ${created} criados · ${updated} atualizados · ${skipped} ignorados`)
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Erro na importação'),
  })

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    importMut.mutate(fd)
    e.target.value = ''
  }

  const items  = data?.items  || []
  const total  = data?.total  || 0
  const pages  = data?.pages  || 1

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="gs-page-title">Clientes</h1>
          <p className="gs-page-sub">{total > 0 ? `${total} clientes cadastrados` : 'Nenhum cliente ainda'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowBanks(true)} className="gs-btn gs-btn-outline">
            <Landmark size={14} /> Bancos
          </button>
          {/* Dropdown planilha */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(m => !m)}
              className="gs-btn gs-btn-dark"
            >
              <Download size={14} />
              Planilha
              <ChevronDown size={13} className={`transition-transform ${showMenu ? 'rotate-180' : ''}`} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1.5 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 w-48">
                <button
                  onClick={handleExport}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Download size={14} className="text-gray-400" /> Baixar planilha
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => { fileRef.current?.click(); setShowMenu(false) }}
                  disabled={importMut.isPending}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <Upload size={14} className="text-gray-400" />
                  {importMut.isPending ? 'Importando...' : 'Atualizar dados'}
                </button>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {/* Barra de busca */}
      <div className="gs-card p-3 flex items-center gap-2">
        <Search size={15} className="text-gray-400 flex-shrink-0" />
        <input
          className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
          placeholder="Buscar por nome, CNPJ ou ID..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
        {search && (
          <button onClick={() => { setSearch(''); setPage(1) }} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="gs-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{tableLayout:'fixed'}}>
            <thead>
              <tr>
                <th className="gs-th" style={{width:'22%'}}>Cliente</th>
                <th className="gs-th" style={{width:'14%'}}>CNPJ</th>
                <th className="gs-th" style={{width:'16%'}}>Contato</th>
                <th className="gs-th" style={{width:'20%'}}>Endereço</th>
                <th className="gs-th" style={{width:'18%'}}>Banco</th>
                <th className="gs-th" style={{width:'10%', paddingRight:'28px'}}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">Carregando...</td></tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    <Users size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum cliente encontrado</p>
                    <p className="text-xs mt-1">Use "Planilha → Atualizar dados" para importar clientes via planilha Excel</p>
                  </td>
                </tr>
              )}
              {items.map(p => (
                <tr key={p.id_smart} className="gs-tr border-t border-gray-100">
                  {/* Cliente — alinhado à esquerda */}
                  <td className="gs-td">
                    <p className="text-xs font-medium text-gray-900 truncate">{p.nome || '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{p.id_smart}</p>
                  </td>
                  {/* CNPJ — centralizado, nowrap */}
                  <td className="gs-td text-center text-gray-600 font-mono text-xs whitespace-nowrap">
                    {fmtCnpj(p.cnpj || '')}
                  </td>
                  {/* Contato — centralizado */}
                  <td className="gs-td text-center">
                    {p.telefone && (
                      <p className="flex items-center justify-center gap-1 text-xs text-gray-700">
                        <Phone size={10} className="text-gray-400 flex-shrink-0" />
                        {fmtTelefone(p.telefone)}
                      </p>
                    )}
                    {p.email && (
                      <p className="flex items-center justify-center gap-1 text-xs text-gray-400 truncate" title={p.email}>
                        <Mail size={10} className="flex-shrink-0" />
                        <span className="truncate">{p.email}</span>
                      </p>
                    )}
                    {!p.telefone && !p.email && <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  {/* Endereço — 1 linha com tooltip completo */}
                  <td className="gs-td text-gray-600" style={{fontSize:'11px'}}>
                    {(p.logradouro || p.cidade) ? (() => {
                      const fullAddr = [
                        p.logradouro && `${p.logradouro}${p.numero ? `, ${p.numero}` : ''}${p.complemento ? ` — ${p.complemento}` : ''}`,
                        p.bairro,
                        [p.cep && fmtCep(p.cep), p.cidade && `${p.cidade}${p.estado ? `/${p.estado}` : ''}`].filter(Boolean).join(' · ')
                      ].filter(Boolean).join(', ')
                      return <p className="truncate" title={fullAddr}>{fullAddr}</p>
                    })() : <span className="text-gray-300">—</span>}
                  </td>
                  {/* Banco — centralizado */}
                  <td className="gs-td text-center">
                    {p.banco_nome
                      ? <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 whitespace-nowrap">
                          <Building2 size={10} /> {p.banco_nome}
                        </span>
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                  {/* Ações — centralizado */}
                  <td className="gs-td text-center" style={{paddingRight:'28px'}}>
                    <button
                      onClick={() => setEditing(p)}
                      title="Editar cliente"
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-xs text-gray-500">Página {page} de {pages} · {total} clientes</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 text-gray-600">
                <ChevronLeft size={15} />
              </button>
              <button onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page === pages}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 text-gray-600">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modais */}
      {editing   && <EditModal profile={editing} banks={banksData} onClose={() => setEditing(null)} />}
      {showBanks && <BanksModal onClose={() => setShowBanks(false)} />}
    </div>
  )
}
