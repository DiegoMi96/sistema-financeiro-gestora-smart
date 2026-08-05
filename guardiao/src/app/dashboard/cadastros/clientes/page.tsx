"use client"

import { useState, useEffect } from "react"
import apiClient from "@/lib/api"
import {
  Plus, Upload, Edit2, Trash2, Loader, Search,
  X, Building2, CheckCircle, AlertCircle,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react"

const LIMIT = 25

interface Client {
  id: string
  cnpj: string
  name: string
  consultant_name: string
  phone: string
  email: string
  messaging_package: string
  is_active: boolean
  created_at: string
}

const emptyForm = {
  cnpj: "",
  name: "",
  consultant_name: "",
  phone: "",
  email: "",
  messaging_package: "Não",
}

export default function ClientsPage() {
  const [clients, setClients]             = useState<Client[]>([])
  const [total, setTotal]                 = useState(0)
  const [page, setPage]                   = useState(1)
  const [isLoading, setIsLoading]         = useState(true)
  const [flash, setFlash]                 = useState<{ type: "success" | "error"; msg: string } | null>(null)
  const [searchQuery, setSearchQuery]     = useState("")
  const [showModal, setShowModal]         = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importResult, setImportResult]   = useState<{ created: number; updated: number } | null>(null)
  const [importing, setImporting]         = useState(false)
  const [editingId, setEditingId]         = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget]   = useState<Client | null>(null)
  const [deleting, setDeleting]           = useState(false)
  const [saving, setSaving]               = useState(false)
  const [formData, setFormData]           = useState(emptyForm)

  // appliedQuery é a busca que está realmente em vigor (o que o usuário
  // digitou só vira busca de verdade ao clicar "Buscar"/Enter) — fica
  // separado de searchQuery (o texto do campo) pra poder ser dependência do
  // useEffect sem disparar uma busca a cada tecla digitada.
  const [appliedQuery, setAppliedQuery]   = useState("")
  const [refreshKey, setRefreshKey]       = useState(0)

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  useEffect(() => { fetchClients() }, [page, appliedQuery, refreshKey])

  const resetPage = () => setPage(1)
  const refresh    = () => setRefreshKey((k) => k + 1)

  const showFlash = (type: "success" | "error", msg: string) => {
    setFlash({ type, msg })
    setTimeout(() => setFlash(null), 4000)
  }

  const fetchClients = async () => {
    setIsLoading(true)
    try {
      const params: Record<string, any> = { skip: (page - 1) * LIMIT, limit: LIMIT }
      if (appliedQuery) params.query = appliedQuery
      const response = await apiClient.get("/clients", { params })
      setClients(response.data?.clients ?? response.data ?? [])
      setTotal(response.data?.total ?? response.data?.clients?.length ?? 0)
    } catch {
      showFlash("error", "Erro ao carregar clientes")
    } finally {
      setIsLoading(false)
    }
  }

  const applySearch = () => {
    setAppliedQuery(searchQuery)
    if (page === 1) refresh()
    else resetPage()
  }

  const clearSearch = () => {
    setSearchQuery("")
    setAppliedQuery("")
    if (page === 1) refresh()
    else resetPage()
  }

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editingId) {
        await apiClient.put(`/clients/${editingId}`, formData)
        showFlash("success", "Cliente atualizado com sucesso.")
      } else {
        await apiClient.post("/clients", formData)
        showFlash("success", "Cliente criado com sucesso.")
      }
      setFormData(emptyForm)
      setEditingId(null)
      setShowModal(false)
      refresh()
    } catch (err: any) {
      showFlash("error", err.response?.data?.detail || "Erro ao salvar cliente")
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (client: Client) => {
    setFormData({
      cnpj:              client.cnpj,
      name:              client.name,
      consultant_name:   client.consultant_name || "",
      phone:             client.phone || "",
      email:             client.email || "",
      messaging_package: client.messaging_package || "Não",
    })
    setEditingId(client.id)
    setShowModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiClient.delete(`/clients/${deleteTarget.id}`)
      showFlash("success", `Cliente "${deleteTarget.name}" removido.`)
      setDeleteTarget(null)
      refresh()
    } catch {
      showFlash("error", "Erro ao remover cliente")
    } finally {
      setDeleting(false)
    }
  }

  const handleImport = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fileInput = e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement
    const file = fileInput?.files?.[0]
    if (!file) { showFlash("error", "Selecione um arquivo Excel"); return }

    setImporting(true)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const response = await apiClient.post("/clients/import/sync", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      setImportResult({ created: response.data.created, updated: response.data.updated })
      refresh()
    } catch (err: any) {
      showFlash("error", err.response?.data?.detail || "Erro ao importar clientes")
      setShowImportModal(false)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">Cadastro de Clientes</h1>
          <p className="text-muted-foreground">Gerencie o cadastro mestre de clientes</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isLoading && total > 0 && (
            <div className="bg-primary/10 text-primary px-4 py-2 rounded-xl text-sm font-semibold">
              {total} cliente{total !== 1 ? "s" : ""}
            </div>
          )}
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors text-sm font-medium"
          >
            <Upload className="w-4 h-4" /> Importar
          </button>
          <button
            onClick={() => { setFormData(emptyForm); setEditingId(null); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Novo Cliente
          </button>
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div className={`flex items-center justify-between p-4 rounded-xl border text-sm ${
          flash.type === "success"
            ? "bg-green-500/10 border-green-500/30 text-green-700"
            : "bg-destructive/10 border-destructive/30 text-destructive"
        }`}>
          <div className="flex items-center gap-2">
            {flash.type === "success"
              ? <CheckCircle className="w-4 h-4" />
              : <AlertCircle className="w-4 h-4" />}
            {flash.msg}
          </div>
          <button onClick={() => setFlash(null)}><X className="w-4 h-4 opacity-60 hover:opacity-100" /></button>
        </div>
      )}

      {/* Busca */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por razão social, CNPJ/CPF ou email..."
            value={searchQuery}
            onChange={handleSearch}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            className="w-full pl-10 pr-8 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={applySearch}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Search className="w-4 h-4" />
          Buscar
        </button>
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">Carregando clientes...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
          <p className="font-semibold text-lg">Nenhum cliente cadastrado</p>
          <p className="text-muted-foreground text-sm mt-1">
            {appliedQuery ? `Sem resultados para "${appliedQuery}"` : "Importe uma planilha ou cadastre manualmente"}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-muted border-b border-border">
                <tr>
                  <th className="px-6 py-3.5 text-left font-medium text-muted-foreground">CNPJ / CPF</th>
                  <th className="px-6 py-3.5 text-left font-medium text-muted-foreground">Razão Social</th>
                  <th className="px-6 py-3.5 text-left font-medium text-muted-foreground">Vendedor</th>
                  <th className="px-6 py-3.5 text-left font-medium text-muted-foreground">WhatsApp</th>
                  <th className="px-6 py-3.5 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-6 py-3.5 text-center font-medium text-muted-foreground">Mensageria</th>
                  <th className="px-6 py-3.5 text-center font-medium text-muted-foreground">Status</th>
                  <th className="px-6 py-3.5 text-center font-medium text-muted-foreground w-24">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-4 text-xs">{client.cnpj || "—"}</td>
                    <td className="px-6 py-4 font-medium max-w-[200px] truncate" title={client.name}>
                      {client.name || "—"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{client.consultant_name || "—"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{client.phone || "—"}</td>
                    <td className="px-6 py-4 text-muted-foreground max-w-[180px] truncate" title={client.email}>
                      {client.email || "—"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        client.messaging_package === "Sim"
                          ? "bg-green-500/10 text-green-600"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {client.messaging_package || "Não"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        client.is_active
                          ? "bg-green-500/10 text-green-600"
                          : "bg-red-500/10 text-red-600"
                      }`}>
                        {client.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEdit(client)}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(client)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                          title="Remover"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Página <span className="font-medium text-foreground">{page}</span> de <span className="font-medium text-foreground">{totalPages}</span>
            </p>

            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const p = start + i
                return p <= totalPages ? (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      page === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}>
                    {p}
                  </button>
                ) : null
              })}

              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Criar/Editar */}
      {showModal && (
        <div className="fixed inset-0 !mt-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="text-lg font-bold">{editingId ? "Editar Cliente" : "Novo Cliente"}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">CNPJ / CPF <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={formData.cnpj}
                  onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                  disabled={!!editingId}
                  placeholder="00.000.000/0001-00"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Razão Social <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nome da empresa ou pessoa"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Vendedor</label>
                <input
                  type="text"
                  value={formData.consultant_name}
                  onChange={(e) => setFormData({ ...formData, consultant_name: e.target.value })}
                  placeholder="Nome do vendedor responsável"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">WhatsApp</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(11) 99999-0000"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contato@empresa.com"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Assinante Pacote Mensageria</label>
                <select
                  value={formData.messaging_package}
                  onChange={(e) => setFormData({ ...formData, messaging_package: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                >
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                >
                  {saving && <Loader className="w-4 h-4 animate-spin" />}
                  {editingId ? "Atualizar" : "Criar"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 !mt-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="text-lg font-bold">Remover Cliente</h2>
              {!deleting && (
                <button onClick={() => setDeleteTarget(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-muted-foreground mb-1">Tem certeza que deseja remover o cliente:</p>
              <p className="font-semibold mb-4">{deleteTarget.name}</p>
              <p className="text-xs text-muted-foreground mb-6">Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  className="flex-1 py-2.5 bg-destructive text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                >
                  {deleting && <Loader className="w-4 h-4 animate-spin" />}
                  {deleting ? "Removendo..." : "Remover"}
                </button>
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar */}
      {showImportModal && (
        <div className="fixed inset-0 !mt-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="text-lg font-bold">
                {importResult ? "Importação concluída" : "Importar Cadastro"}
              </h2>
              {!importing && (
                <button
                  onClick={() => { setShowImportModal(false); setImportResult(null) }}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="px-6 py-5">
              {importResult ? (
                <div className="text-center">
                  <div className="p-4 rounded-full bg-green-500/10 w-fit mx-auto mb-4">
                    <CheckCircle className="w-10 h-10 text-green-600" />
                  </div>
                  <div className="bg-muted rounded-xl p-4 text-sm text-left space-y-3 mb-6">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Clientes criados</span>
                      <span className="font-semibold text-primary">{importResult.created}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Clientes atualizados</span>
                      <span className="font-medium">{importResult.updated}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowImportModal(false); setImportResult(null) }}
                    className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 text-sm"
                  >
                    Fechar
                  </button>
                </div>
              ) : (
                <form onSubmit={handleImport} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Arquivo Excel (.xlsx)</label>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                      required
                    />
                  </div>
                  <div className="bg-muted rounded-xl p-4 text-xs text-muted-foreground space-y-1.5">
                    <p className="font-medium text-foreground text-sm mb-2">Colunas esperadas:</p>
                    <p>• <strong className="text-foreground">Razão Social</strong> – nome do cliente</p>
                    <p>• <strong className="text-foreground">CNPJ</strong> – se vazio, usa CPF</p>
                    <p>• <strong className="text-foreground">Vendedor</strong></p>
                    <p>• <strong className="text-foreground">WhatsApp</strong></p>
                    <p>• <strong className="text-foreground">Email</strong></p>
                    <p>• <strong className="text-foreground">Assinante Pacote Mensageria</strong> (Sim / Não)</p>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={importing}
                      className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                    >
                      {importing && <Loader className="w-4 h-4 animate-spin" />}
                      {importing ? "Importando..." : "Importar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowImportModal(false)}
                      className="flex-1 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

