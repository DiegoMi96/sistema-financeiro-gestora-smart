import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { authApi } from '../../services/api'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Plus, Edit2, Power, Shield, Trash2,
  ChevronDown, ChevronRight, Users, Loader,
} from 'lucide-react'

// ── Constantes compartilhadas ─────────────────────────────────

const ROLES = [
  { value: 'admin',           label: 'Administrador' },
  { value: 'gestor',          label: 'Gestor' },
  { value: 'contas_receber',  label: 'Contas a Receber' },
  { value: 'suporte_tecnico', label: 'Suporte Técnico' },
  { value: 'logistica',       label: 'Logística' },
  { value: 'backoffice',      label: 'Backoffice' },
  { value: 'comercial',       label: 'Comercial' },
]

const PERM_SECTIONS = [
  { key: 'MÓDULOS — cards visíveis', perms: [
    ['can_view_dashboard',     'Dashboard / Painel'],
    ['can_view_faturamento',   'Faturamento'],
    ['can_edit_billing',       'Editar faturamento'],
    ['can_view_contestacao',   'Contestação'],
    ['can_view_comissao',      'Comissionamento'],
    ['can_view_logistica',     'Logística'],
    ['can_view_organograma',   'Organograma — visualizar'],
    ['can_edit_organograma',   'Organograma — editar'],
    ['can_view_controladoria', 'Controladoria'],
    ['can_manage_users',       'Gestão de Acessos'],
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
  { key: 'CONTROLADORIA — abas visíveis', perms: [
    ['can_view_ctrl_indicadores', 'Resumo Executivo'],
    ['can_view_ctrl_dre',         'Resumo Financeiro'],
    ['can_view_ctrl_sales',       'Vendas & Performance'],
    ['can_view_ctrl_ops',         'Operação'],
    ['can_view_ctrl_logistics',   'Logística'],
    ['can_view_ctrl_rh',          'RH'],
    ['can_view_ctrl_fluxo_caixa', 'DFC Gerencial'],
  ]},
  { key: 'SMT', perms: [
    ['can_view_smt', 'Acesso ao Dashboard SMT'],
  ]},
  { key: 'GUARDIÃO', perms: [
    ['can_view_guardiao', 'Acesso ao Dashboard Guardião'],
  ]},
]

const ALL_PERMS = PERM_SECTIONS.flatMap(s => s.perms)

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

const INPUT = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none'

// ── Página principal ──────────────────────────────────────────

export default function AcessosPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('usuarios')

  const TABS = [
    { id: 'usuarios', label: 'Usuários' },
    { id: 'perfis',   label: 'Perfis & Permissões' },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFB' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB' }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={15} />
            Voltar
          </button>
          <div style={{ width: 1, height: 20, background: '#E5E7EB' }} />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#EFF6FF' }}>
              <Shield size={16} style={{ color: '#2563EB' }} />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-none">Gestão de Acessos</h1>
              <p className="text-xs text-gray-400 mt-0.5">Usuários, perfis e permissões do sistema</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-6 flex gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {tab === 'usuarios' && <UsuariosTab />}
        {tab === 'perfis'   && <PerfisTab />}
      </div>
    </div>
  )
}

// ── Aba Usuários ──────────────────────────────────────────────

function UsuariosTab() {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)
  const qc = useQueryClient()

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => authApi.users().then(r => r.data),
    staleTime: 30 * 1000,
  })

  const deactivate = useMutation({
    mutationFn: (id) => authApi.deleteUser(id),
    onSuccess: () => { toast.success('Usuário desativado'); qc.invalidateQueries({ queryKey: ['users'] }) },
    onError: () => toast.error('Erro ao desativar usuário'),
  })

  const initials = (name = '') => name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <Loader size={18} className="animate-spin text-gray-400" />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Usuários do sistema</h2>
          <p className="text-xs text-gray-400 mt-0.5">{users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ background: '#111827' }}
        >
          <Plus size={14} /> Novo usuário
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuário</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">E-mail</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Perfil</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: '#EFF6FF', color: '#2563EB' }}>
                        {initials(u.name)}
                      </div>
                      <span className="font-medium text-gray-900">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-700'}`}>
                      {u.role_label}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      u.is_active
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-red-400'}`} />
                      {u.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => { setEditing(u); setShowForm(true) }}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>
                      {u.is_active && (
                        <button
                          onClick={() => { if (window.confirm(`Desativar ${u.name}?`)) deactivate.mutate(u.id) }}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Desativar"
                        >
                          <Power size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

// ── Modal criar/editar usuário ────────────────────────────────

function UserFormModal({ user, onClose, onSuccess }) {
  const isEdit = !!user

  const { data: apiRoles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get('/settings/roles').then(r => r.data),
    staleTime: 60 * 1000,
  })

  const [form, setForm] = useState(user ? {
    name: user.name,
    role: user.role,
    custom_role_key: user.custom_role_key || null,
    is_active: user.is_active,
    ...Object.fromEntries(ALL_PERMS.map(([k]) => [k, user.permissions?.[k] ?? null])),
  } : {
    name: '', email: '', password: '', role: 'contas_receber',
    custom_role_key: null,
    ...Object.fromEntries(ALL_PERMS.map(([k]) => [k, null])),
  })
  const [loading, setLoading] = useState(false)
  const [openSections, setOpenSections] = useState(
    Object.fromEntries(PERM_SECTIONS.map(s => [s.key, s.key === 'MÓDULOS — cards visíveis']))
  )

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const toggleSection = (key) => setOpenSections(o => ({ ...o, [key]: !o[key] }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isEdit) { await authApi.updateUser(user.id, form); toast.success('Usuário atualizado!') }
      else        { await authApi.createUser(form);          toast.success('Usuário criado!') }
      onSuccess()
    } catch (err) {
      const detail = err.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Erro ao salvar usuário')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">{isEdit ? 'Editar usuário' : 'Novo usuário'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isEdit ? 'Atualize os dados e permissões individuais' : 'Preencha os dados e configure as permissões'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-5 space-y-4">
            {/* Dados básicos */}
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome completo *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} required className={INPUT} placeholder="Ex: Melissa Souza" />
              </div>
              {!isEdit && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">E-mail *</label>
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required className={INPUT} placeholder="melissa@empresa.com.br" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Senha inicial *</label>
                    <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} className={INPUT} placeholder="Mínimo 6 caracteres" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Perfil base</label>
                <select
                  value={form.custom_role_key ? `cus:${form.custom_role_key}` : `sys:${form.role}`}
                  onChange={e => {
                    const val = e.target.value
                    if (val.startsWith('cus:')) {
                      setForm(f => ({ ...f, custom_role_key: val.slice(4) }))
                    } else {
                      setForm(f => ({ ...f, role: val.slice(4), custom_role_key: null }))
                    }
                  }}
                  className={INPUT}
                >
                  <optgroup label="Perfis do sistema">
                    {apiRoles.filter(r => !r.is_custom).map(r => (
                      <option key={`sys:${r.role}`} value={`sys:${r.role}`}>{r.label}</option>
                    ))}
                  </optgroup>
                  {apiRoles.some(r => r.is_custom) && (
                    <optgroup label="Perfis personalizados">
                      {apiRoles.filter(r => r.is_custom).map(r => (
                        <option key={`cus:${r.role}`} value={`cus:${r.role}`}>{r.label}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">As permissões individuais abaixo sobrescrevem o perfil base.</p>
              </div>
            </div>

            {/* Permissões individuais por seção */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <Shield size={12} className="text-gray-400" />
                Permissões individuais
              </p>
              <div className="space-y-2">
                {PERM_SECTIONS.map(section => (
                  <div key={section.key} className="border border-gray-100 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection(section.key)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 text-left"
                    >
                      <span className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">
                        {section.key}
                      </span>
                      {openSections[section.key] ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
                    </button>
                    {openSections[section.key] && (
                      <div className="divide-y divide-gray-50">
                        {section.perms.map(([key, lbl]) => (
                          <div key={key} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50">
                            <span className="text-sm text-gray-700">{lbl}</span>
                            <select
                              value={form[key] === null ? 'null' : String(form[key])}
                              onChange={e => set(key, e.target.value === 'null' ? null : e.target.value === 'true')}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                            >
                              <option value="null">Padrão do perfil</option>
                              <option value="true">✓ Sim</option>
                              <option value="false">✗ Não</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-gray-100 flex gap-3 flex-shrink-0">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ background: loading ? '#9CA3AF' : '#111827' }}>
              {loading ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar usuário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Aba Perfis & Permissões ───────────────────────────────────

function PerfisTab() {
  const [editingRole, setEditingRole] = useState(null)
  const [showNewRole, setShowNewRole] = useState(false)
  const qc = useQueryClient()

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get('/settings/roles').then(r => r.data),
    staleTime: 60 * 1000,
  })

  const deleteMutation = useMutation({
    mutationFn: (slug) => api.delete(`/settings/roles/custom/${slug}`),
    onSuccess: () => { toast.success('Perfil removido'); qc.invalidateQueries({ queryKey: ['roles'] }) },
    onError: (err) => toast.error(err.response?.data?.detail || 'Erro ao remover'),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <Loader size={18} className="animate-spin text-gray-400" />
    </div>
  )

  const systemRoles = roles.filter(r => !r.is_custom)
  const customRoles = roles.filter(r => r.is_custom)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Perfis de acesso</h2>
          <p className="text-xs text-gray-400 mt-0.5">Gerencie as permissões padrão de cada perfil</p>
        </div>
        <button
          onClick={() => setShowNewRole(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ background: '#111827' }}
        >
          <Plus size={14} /> Novo perfil
        </button>
      </div>

      {/* Perfis do sistema */}
      <div>
        <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Perfis do sistema</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {systemRoles.map(role => (
            <RoleCard key={role.role} role={role} onEdit={() => setEditingRole(role)} />
          ))}
        </div>
      </div>

      {/* Perfis personalizados */}
      {customRoles.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-3">Perfis personalizados</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
        <RoleModal
          onClose={() => setShowNewRole(false)}
          onSuccess={() => { setShowNewRole(false); qc.invalidateQueries({ queryKey: ['roles'] }) }}
        />
      )}

      {editingRole && (
        <RoleModal
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

  const pct = role.total > 0 ? Math.round((role.total_enabled / role.total) * 100) : 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3 hover:shadow-md hover:border-gray-300 transition-all">
      <div className="flex items-start justify-between gap-2">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colorClass}`}>
          {role.label}
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide ${
          role.is_custom ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
        }`}>
          {role.is_custom ? 'CUSTOM' : 'SISTEMA'}
        </span>
      </div>

      <p className="text-xs text-gray-500 line-clamp-2 flex-1">{role.description || '—'}</p>

      {/* Barra de progresso de permissões */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400">Permissões ativas</span>
          <span className="text-[10px] font-semibold text-gray-600">{role.total_enabled}/{role.total}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#3CB54A' }} />
        </div>
      </div>

      <div className="flex gap-2 pt-1 border-t border-gray-100">
        <button onClick={onEdit}
          className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
          <Edit2 size={11} /> Editar
        </button>
        {role.is_custom ? (
          <button onClick={onDelete}
            className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center gap-1">
            <Trash2 size={11} /> Excluir
          </button>
        ) : (
          <div className="flex-1" />
        )}
      </div>
    </div>
  )
}

// ── Modal criar/editar perfil ─────────────────────────────────

function RoleModal({ role, onClose, onSuccess }) {
  const isEdit = !!role
  const [label, setLabel]   = useState(role?.label || '')
  const [desc, setDesc]     = useState(role?.description || '')
  const [color, setColor]   = useState(role?.color || 'blue')
  const [perms, setPerms]   = useState(
    isEdit
      ? { ...role.permissions }
      : Object.fromEntries(ALL_PERMS.map(([k]) => [k, false]))
  )
  const [open, setOpen] = useState(
    Object.fromEntries(PERM_SECTIONS.map(s => [s.key, s.key === 'MÓDULOS — cards visíveis']))
  )
  const [loading, setLoading] = useState(false)

  const togglePerm = (key) => setPerms(p => ({ ...p, [key]: !p[key] }))
  const markAll = (sectionPerms, value) => setPerms(p => {
    const next = { ...p }
    sectionPerms.forEach(([k]) => { next[k] = value })
    return next
  })

  const handleSave = async () => {
    if (!isEdit && !label.trim()) return toast.error('Informe o nome do perfil')
    setLoading(true)
    try {
      if (isEdit) {
        if (role.is_custom) {
          await api.put(`/settings/roles/custom/${role.role}`, { label, description: desc, color, permissions: perms })
        } else {
          await api.put(`/settings/roles/${role.role}`, { permissions: perms, description: desc })
        }
        toast.success('Permissões salvas!')
      } else {
        await api.post('/settings/roles/custom', { label, description: desc, color, permissions: perms })
        toast.success('Perfil criado!')
      }
      onSuccess()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally { setLoading(false) }
  }

  const modalTitle = isEdit
    ? (role.is_custom ? `Editar perfil: ${role.label}` : `Permissões: ${role.label}`)
    : 'Novo perfil personalizado'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-gray-400" />
            <div>
              <h2 className="font-semibold text-gray-900">{modalTitle}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {isEdit && !role.is_custom ? 'Perfil do sistema — o nome não pode ser alterado.' : 'Configure as permissões deste perfil.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Nome + cor (só para perfis custom) */}
          {(!isEdit || role.is_custom) && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Nome do perfil {!isEdit && '*'}
                </label>
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  disabled={isEdit && !role.is_custom}
                  placeholder="Ex: Analista Regional"
                  className={INPUT + (isEdit && !role.is_custom ? ' opacity-50 cursor-not-allowed' : '')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cor</label>
                <select value={color} onChange={e => setColor(e.target.value)} className={INPUT} style={{ width: 110 }}>
                  {CUSTOM_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {label && (!isEdit || role.is_custom) && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Preview:</span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${COLOR_CLASSES[color] || ''}`}>{label}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Descrição</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className={INPUT + ' resize-none'}
              placeholder="Descreva brevemente o que este perfil pode fazer..." />
          </div>

          {/* Seções de permissão */}
          <div className="space-y-2">
            {PERM_SECTIONS.map(section => (
              <div key={section.key} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setOpen(o => ({ ...o, [section.key]: !o[section.key] }))}
                    className="flex items-center gap-2 text-[10px] font-semibold tracking-widest text-gray-400 uppercase"
                  >
                    {open[section.key] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {section.key}
                  </button>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => markAll(section.perms, true)}
                      className="text-xs text-blue-500 hover:text-blue-700 hover:underline">Tudo</button>
                    <button type="button" onClick={() => markAll(section.perms, false)}
                      className="text-xs text-gray-400 hover:text-gray-600 hover:underline">Nenhum</button>
                  </div>
                </div>
                {open[section.key] && (
                  <div className="divide-y divide-gray-50">
                    {section.perms.map(([key, lbl]) => (
                      <label key={key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!perms[key]}
                          onChange={() => togglePerm(key)}
                          className="accent-green-600 w-4 h-4 flex-shrink-0 cursor-pointer"
                        />
                        <span className="text-sm text-gray-700 select-none">{lbl}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: loading ? '#9CA3AF' : '#3CB54A' }}>
            {loading ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar perfil'}
          </button>
        </div>
      </div>
    </div>
  )
}
