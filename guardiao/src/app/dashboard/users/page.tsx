"use client"

import { useState, useEffect } from "react"
import apiClient from "@/lib/api"
import { Plus, Users as UsersIcon, Loader, Pencil, Trash2, ShieldCheck, BarChart2, Eye } from "lucide-react"

type Role = "admin" | "analyst" | "viewer"

interface User {
  id: string
  email: string
  full_name: string
  role: Role
  is_active: boolean
  created_at: string
  last_login?: string
}

const ROLE_CONFIG: Record<Role, { label: string; color: string; icon: any; description: string }> = {
  admin:   { label: "Administrador", color: "bg-purple-500/10 text-purple-600",  icon: ShieldCheck, description: "Acesso total ao sistema" },
  analyst: { label: "Analista",      color: "bg-blue-500/10 text-blue-600",     icon: BarChart2,   description: "Pode fazer upload e resolver acionamentos" },
  viewer:  { label: "Visualizador",  color: "bg-gray-500/10 text-gray-600",     icon: Eye,         description: "Apenas visualização, sem ações" },
}

const emptyForm = { email: "", full_name: "", password: "", role: "analyst" as Role }

export default function UsersPage() {
  const [users, setUsers]       = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]       = useState("")
  const [success, setSuccess]   = useState("")
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]   = useState<User | null>(null)
  const [formData, setFormData] = useState(emptyForm)
  const [saving, setSaving]     = useState(false)

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setIsLoading(true)
    setError("")
    try {
      const { data } = await apiClient.get("/users")
      setUsers(data.users ?? [])
    } catch {
      setError("Erro ao carregar usuários.")
    } finally {
      setIsLoading(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setFormData(emptyForm)
    setError("")
    setShowModal(true)
  }

  const openEdit = (user: User) => {
    setEditing(user)
    setFormData({ email: user.email, full_name: user.full_name, password: "", role: user.role })
    setError("")
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditing(null)
    setFormData(emptyForm)
    setError("")
  }

  const flash = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(""), 3000)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError("")
    try {
      if (editing) {
        const body: any = { full_name: formData.full_name, role: formData.role }
        if (formData.password) body.password = formData.password
        await apiClient.patch(`/users/${editing.id}`, body)
        flash("Usuário atualizado com sucesso.")
      } else {
        await apiClient.post("/users", formData)
        flash("Usuário criado com sucesso.")
      }
      closeModal()
      await fetchUsers()
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Erro ao salvar usuário.")
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (user: User) => {
    try {
      await apiClient.patch(`/users/${user.id}`, { is_active: !user.is_active })
      flash(user.is_active ? "Usuário desativado." : "Usuário ativado.")
      await fetchUsers()
    } catch {
      setError("Erro ao alterar status do usuário.")
    }
  }

  const handleDelete = async (user: User) => {
    if (!confirm(`Deletar o usuário "${user.full_name}"? Esta ação não pode ser desfeita.`)) return
    try {
      await apiClient.delete(`/users/${user.id}`)
      flash("Usuário deletado.")
      await fetchUsers()
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Erro ao deletar usuário.")
    }
  }

  const formatDate = (raw?: string) =>
    raw ? new Date(raw).toLocaleDateString("pt-BR") : "Nunca"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">Usuários</h1>
          <p className="text-muted-foreground">Gerencie os acessos ao sistema</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      {/* Perfis info */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(ROLE_CONFIG) as [Role, typeof ROLE_CONFIG[Role]][]).map(([role, cfg]) => {
          const Icon = cfg.icon
          const count = users.filter(u => u.role === role).length
          return (
            <div key={role} className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${cfg.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{cfg.label}</p>
                <p className="font-semibold">{count} usuário{count !== 1 ? "s" : ""}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Feedback */}
      {success && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-600 text-sm">
          {success}
        </div>
      )}
      {error && !showModal && (
        <div className="p-3 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Tabela */}
      {isLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <UsersIcon className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
          <p className="font-semibold text-lg">Nenhum usuário cadastrado</p>
          <p className="text-muted-foreground text-sm mt-1">Crie o primeiro usuário para começar.</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-muted border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Nome</th>
                <th className="px-6 py-3 text-left font-medium">Email</th>
                <th className="px-6 py-3 text-left font-medium">Perfil</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                <th className="px-6 py-3 text-left font-medium">Último acesso</th>
                <th className="px-6 py-3 text-left font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const cfg  = ROLE_CONFIG[user.role] ?? ROLE_CONFIG.viewer
                const Icon = cfg.icon
                return (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium">{user.full_name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleActive(user)}
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                          user.is_active
                            ? "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                            : "bg-red-500/10 text-red-600 hover:bg-red-500/20"
                        }`}
                      >
                        {user.is_active ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(user.last_login)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(user)}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                          title="Deletar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 !mt-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-bold">
                {editing ? "Editar Usuário" : "Novo Usuário"}
              </h2>
              {editing && (
                <p className="text-sm text-muted-foreground mt-1">{editing.email}</p>
              )}
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4" autoComplete="new-password">
              {!editing && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email</label>
                  <input
                    type="text"
                    inputMode="email"
                    autoComplete="new-password"
                    name="guardiao-new-email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5">Nome completo</label>
                <input
                  type="text"
                  autoComplete="new-password"
                  name="guardiao-fullname"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  {editing ? "Nova senha (deixe em branco para manter)" : "Senha"}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  name="guardiao-new-password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  required={!editing}
                  minLength={6}
                  placeholder={editing ? "â€¢â€¢â€¢â€¢â€¢â€¢" : ""}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Perfil de acesso</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.entries(ROLE_CONFIG) as [Role, typeof ROLE_CONFIG[Role]][]).map(([role, cfg]) => {
                    const Icon = cfg.icon
                    const selected = formData.role === role
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setFormData({ ...formData, role })}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs font-medium transition-colors ${
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {ROLE_CONFIG[formData.role].description}
                </p>
              </div>

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive rounded-lg text-destructive text-xs">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar usuário"}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2.5 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

