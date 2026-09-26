import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../../services/api'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { Plus, Edit2, Power } from 'lucide-react'

const SYSTEM_ROLES = [
  { value:'admin',          label:'Administrador' },
  { value:'gestor',         label:'Gestor' },
  { value:'contas_receber', label:'Contas a Receber' },
  { value:'suporte_tecnico',label:'Suporte Técnico' },
  { value:'logistica',      label:'Logística' },
  { value:'backoffice',     label:'Backoffice' },
  { value:'comercial',      label:'Comercial' },
]

const PERMS = [
  ['can_edit_billing',      'Editar faturamento'],
  ['can_approve_billing',   'Aprovar faturamento'],
  ['can_view_dashboard',    'Ver dashboard'],
  ['can_manage_users',      'Gerenciar usuários'],
  ['can_view_contestacao',  'Ver contestação'],
  ['can_view_comissao',     'Ver comissionamento'],
  ['can_approve_adjustment','Pode aprovar ajustes'],
]

export default function UsersPage() {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)
  const qc = useQueryClient()

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => authApi.users().then(r => r.data),
  })

  const { data: allRoles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get('/settings/roles').then(r => r.data),
  })
  const customRoles = allRoles.filter(r => r.is_custom)

  const deactivateMutation = useMutation({
    mutationFn: (id) => authApi.deleteUser(id),
    onSuccess: () => { toast.success('Usuário desativado'); qc.invalidateQueries({ queryKey: ['users'] }) },
  })

  const reactivateMutation = useMutation({
    mutationFn: (id) => authApi.updateUser(id, { is_active: true }),
    onSuccess: () => { toast.success('Usuário reativado'); qc.invalidateQueries({ queryKey: ['users'] }) },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="gs-page-title">Usuários</h1>
          <p className="gs-page-sub">Gerenciamento de acessos e permissões</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setEditing(null); setShowForm(true) }} className="gs-btn gs-btn-dark">
            <Plus size={16} />
            Novo Usuário
          </button>
        </div>
      </div>

      <div className="gs-card overflow-hidden">
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
                const initials = u.name?.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || '?'
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
                        {u.is_active ? (
                          <button onClick={() => {
                            if (!window.confirm(`Desativar o usuário "${u.name}"? Esta ação pode ser revertida apenas manualmente.`)) return
                            deactivateMutation.mutate(u.id)
                          }}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                            <Power size={14} />
                          </button>
                        ) : (
                          <button onClick={() => reactivateMutation.mutate(u.id)}
                            title="Reativar usuário"
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors">
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

      {showForm && (
        <UserFormModal
          user={editing}
          customRoles={customRoles}
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['users'] }) }}
        />
      )}
    </div>
  )
}

function UserFormModal({ user, customRoles = [], onClose, onSuccess }) {
  const isEdit = !!user

  // Determina o valor inicial do dropdown (custom:slug ou system role)
  const initialRoleValue = user?.custom_role_key
    ? `custom:${user.custom_role_key}`
    : (user?.role || 'contas_receber')

  const [form, setForm] = useState(user ? {
    name: user.name, roleValue: initialRoleValue, is_active: user.is_active,
    ...Object.fromEntries(PERMS.map(([k]) => [k, user.permissions?.[k] ?? null]))
  } : {
    name:'', email:'', password:'', roleValue:'contas_receber',
    ...Object.fromEntries(PERMS.map(([k]) => [k, null]))
  })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const buildPayload = () => {
    const { roleValue, ...rest } = form
    const isCustom = roleValue.startsWith('custom:')
    return {
      ...rest,
      role: isCustom ? 'backoffice' : roleValue,
      custom_role_key: isCustom ? roleValue.replace('custom:', '') : null,
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = buildPayload()
      if (isEdit) {
        await authApi.updateUser(user.id, payload)
        toast.success('Usuário atualizado!')
      } else {
        await authApi.createUser(payload)
        toast.success('Usuário criado!')
      }
      onSuccess()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Editar Usuário' : 'Novo Usuário'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nome</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          {!isEdit && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">E-mail</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Senha inicial</label>
                <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Perfil</label>
            <select value={form.roleValue} onChange={e => set('roleValue', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
              <optgroup label="Perfis do sistema">
                {SYSTEM_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </optgroup>
              {customRoles.length > 0 && (
                <optgroup label="Perfis personalizados">
                  {customRoles.map(r => <option key={r.role} value={`custom:${r.role}`}>{r.label}</option>)}
                </optgroup>
              )}
            </select>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Permissões individuais <span className="text-gray-400 font-normal">(sobrescrevem o perfil)</span></p>
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
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 gs-btn gs-btn-dark justify-center">
              {loading ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
