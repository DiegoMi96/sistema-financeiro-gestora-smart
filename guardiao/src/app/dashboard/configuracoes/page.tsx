"use client"

import { useState, useEffect } from "react"
import apiClient from "@/lib/api"
import { Loader, Save, ToggleLeft, ToggleRight, Plus, Trash2 } from "lucide-react"

interface Rule {
  id: string
  rule_name: string
  applies_to: string
  threshold_value: number
  is_active: boolean
  description: string
  updated_at: string
}

const APPLIES_OPTIONS = [
  { value: "individual", label: "Linhas individuais" },
  { value: "shared",     label: "Linhas compartilhadas" },
  { value: "all",        label: "Todas as linhas" },
]

const PROTECTED = ["rule-individual", "rule-shared", "rule-growth"]

const emptyForm = { rule_name: "", applies_to: "individual", threshold_value: 100, description: "" }

export default function ConfiguracoesPage() {
  const [rules, setRules]       = useState<Rule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]       = useState("")
  const [success, setSuccess]   = useState("")
  const [saving, setSaving]     = useState<string | null>(null)
  const [edits, setEdits]       = useState<Record<string, { threshold_value: number }>>({})
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState(emptyForm)
  const [formSaving, setFormSaving] = useState(false)

  useEffect(() => { fetchRules() }, [])

  const fetchRules = async () => {
    setIsLoading(true)
    setError("")
    try {
      const { data } = await apiClient.get("/validation-rules")
      setRules(data.rules ?? [])
    } catch {
      setError("Erro ao carregar regras.")
    } finally {
      setIsLoading(false)
    }
  }

  const flash = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(""), 3000)
  }

  const handleSaveThreshold = async (rule: Rule) => {
    const newVal = edits[rule.id]?.threshold_value
    if (newVal === undefined || newVal === rule.threshold_value) return

    setSaving(rule.id)
    try {
      await apiClient.put(`/validation-rules/${rule.id}`, { threshold_value: newVal })
      flash(`Regra "${rule.rule_name}" atualizada.`)
      await fetchRules()
      setEdits(prev => { const n = { ...prev }; delete n[rule.id]; return n })
    } catch {
      setError("Erro ao salvar regra.")
    } finally {
      setSaving(null)
    }
  }

  const handleToggle = async (rule: Rule) => {
    try {
      await apiClient.post(`/validation-rules/${rule.id}/toggle`)
      flash(`Regra "${rule.rule_name}" ${rule.is_active ? "desativada" : "ativada"}.`)
      await fetchRules()
    } catch {
      setError("Erro ao alterar status da regra.")
    }
  }

  const handleDelete = async (rule: Rule) => {
    if (!confirm(`Deletar a regra "${rule.rule_name}"?`)) return
    try {
      await apiClient.delete(`/validation-rules/${rule.id}`)
      flash("Regra deletada.")
      await fetchRules()
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Erro ao deletar regra.")
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormSaving(true)
    try {
      await apiClient.post("/validation-rules", formData)
      flash("Nova regra criada.")
      setShowForm(false)
      setFormData(emptyForm)
      await fetchRules()
    } catch {
      setError("Erro ao criar regra.")
    } finally {
      setFormSaving(false)
    }
  }

  const getThreshold = (rule: Rule) =>
    edits[rule.id]?.threshold_value ?? rule.threshold_value

  const isDirty = (rule: Rule) =>
    edits[rule.id] !== undefined && edits[rule.id].threshold_value !== rule.threshold_value

  const appliesToLabel = (v: string) =>
    APPLIES_OPTIONS.find(o => o.value === v)?.label ?? v

  const formatDate = (raw: string) =>
    new Date(raw).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">Regras de Acionamento</h1>
          <p className="text-muted-foreground">
            Defina os limites de consumo que geram acionamentos no próximo upload.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormData(emptyForm) }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          Nova Regra
        </button>
      </div>

      {success && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-600 text-sm">
          {success}
        </div>
      )}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">Carregando regras...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const isProtected = PROTECTED.includes(rule.id)
            const dirty = isDirty(rule)
            return (
              <div
                key={rule.id}
                className={`bg-card rounded-lg border p-5 transition-colors ${
                  rule.is_active ? "border-border" : "border-border opacity-60"
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(rule)}
                    title={rule.is_active ? "Desativar" : "Ativar"}
                    className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {rule.is_active
                      ? <ToggleRight className="w-6 h-6 text-primary" />
                      : <ToggleLeft className="w-6 h-6" />}
                  </button>

                  {/* Info + Edição */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-base">{rule.rule_name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {appliesToLabel(rule.applies_to)}
                      </span>
                      {!rule.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600">
                          Inativa
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground">{rule.description}</p>

                    {/* Threshold editável */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm font-medium whitespace-nowrap">
                        Limite de consumo (%):
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={getThreshold(rule)}
                        onChange={(e) =>
                          setEdits(prev => ({
                            ...prev,
                            [rule.id]: { threshold_value: Number(e.target.value) }
                          }))
                        }
                        className="w-24 px-3 py-1.5 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary text-center font-medium"
                      />
                      <span className="text-sm text-muted-foreground">%</span>

                      {dirty && (
                        <button
                          onClick={() => handleSaveThreshold(rule)}
                          disabled={saving === rule.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
                        >
                          <Save className="w-3 h-3" />
                          {saving === rule.id ? "Salvando..." : "Salvar"}
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Última atualização: {formatDate(rule.updated_at)}
                    </p>
                  </div>

                  {/* Deletar (só regras customizadas) */}
                  {!isProtected && (
                    <button
                      onClick={() => handleDelete(rule)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Deletar regra"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal nova regra */}
      {showForm && (
        <div className="fixed inset-0 !mt-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-bold">Nova Regra de Acionamento</h2>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Nome da regra</label>
                <input
                  type="text"
                  value={formData.rule_name}
                  onChange={(e) => setFormData({ ...formData, rule_name: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Ex: Limite Especial Cliente X"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Aplica a</label>
                <select
                  value={formData.applies_to}
                  onChange={(e) => setFormData({ ...formData, applies_to: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {APPLIES_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Limite de consumo (%)</label>
                <input
                  type="number"
                  min={1}
                  value={formData.threshold_value}
                  onChange={(e) => setFormData({ ...formData, threshold_value: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={2}
                  placeholder="Descreva quando esta regra deve disparar"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={formSaving}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {formSaving ? "Criando..." : "Criar regra"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
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

