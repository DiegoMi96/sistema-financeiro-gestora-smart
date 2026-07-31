"use client"

import { useState, useRef } from "react"
import apiClient from "@/lib/api"
import { UploadResponse } from "@/types"
import {
  FileSpreadsheet, UploadCloud, CheckCircle, AlertCircle,
  X, Loader, ArrowRight, RefreshCw
} from "lucide-react"
import Link from "next/link"

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UploadPage() {
  const [isDragging, setIsDragging]   = useState(false)
  const [file, setFile]               = useState<File | null>(null)
  const [showModal, setShowModal]     = useState(false)
  const [isLoading, setIsLoading]     = useState(false)
  const [result, setResult]           = useState<UploadResponse | null>(null)
  const [error, setError]             = useState("")
  const inputRef                      = useRef<HTMLInputElement>(null)

  const openModal = (f: File) => {
    setFile(f)
    setResult(null)
    setError("")
    setShowModal(true)
  }

  const closeModal = () => {
    if (isLoading) return
    setShowModal(false)
    setFile(null)
    setResult(null)
    setError("")
    if (inputRef.current) inputRef.current.value = ""
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) openModal(f)
  }
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) openModal(f)
  }

  const handleUpload = async () => {
    if (!file) return
    setIsLoading(true)
    setError("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const response = await apiClient.post<UploadResponse>("/upload/file", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      setResult(response.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erro ao processar o arquivo.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-1">Importar Planilha</h1>
        <p className="text-muted-foreground">Importe um arquivo .xlsx com os dados de consumo das franquias</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Drop Zone */}
        <div className="lg:col-span-2">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`bg-card rounded-xl border-2 border-dashed p-16 flex flex-col items-center justify-center text-center cursor-pointer transition-all select-none ${
              isDragging
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border hover:border-primary hover:bg-muted/40"
            }`}
          >
            <div className={`p-4 rounded-full mb-5 transition-colors ${isDragging ? "bg-primary/10" : "bg-muted"}`}>
              <UploadCloud className={`w-10 h-10 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {isDragging ? "Solte o arquivo aqui" : "Arraste sua planilha aqui"}
            </h3>
            <p className="text-muted-foreground text-sm mb-6">
              ou clique para selecionar um arquivo .xlsx
            </p>
            <span className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium pointer-events-none">
              Selecionar Arquivo
            </span>
            <p className="text-xs text-muted-foreground mt-4">Formatos aceitos: .xlsx · Máx. 10MB</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Colunas esperadas */}
          <div className="mt-6 bg-card rounded-xl border border-border p-6">
            <h3 className="font-semibold mb-3">Colunas esperadas no arquivo</h3>
            <ul className="text-sm text-muted-foreground grid grid-cols-2 gap-y-2 gap-x-4">
              <li>• <strong className="text-foreground">MSISDN</strong> — Número da linha</li>
              <li>• <strong className="text-foreground">Nome do cliente</strong> — Nome do cliente</li>
              <li>• <strong className="text-foreground">CPF/CNPJ</strong> — Documento</li>
              <li>• <strong className="text-foreground">Operadora</strong> — Operadora móvel</li>
              <li>• <strong className="text-foreground">Tipo de compartilhamento</strong> — Individual/Compartilhado</li>
              <li>• <strong className="text-foreground">Franquia (MB)</strong> — Limite em MB</li>
              <li>• <strong className="text-foreground">Porcentagem de consumo</strong> — % consumida</li>
              <li>• <strong className="text-foreground">Status do bloqueio</strong> — Status da linha</li>
            </ul>
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="font-semibold mb-4">Regras de Acionamento</h3>
            <div className="space-y-4 text-sm">
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="font-medium text-yellow-600 mb-1">Contrato Individual</p>
                <p className="text-muted-foreground">Acionamento quando consumo {">="} 100%</p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="font-medium text-red-600 mb-1">Contrato Compartilhado</p>
                <p className="text-muted-foreground">Acionamento quando consumo {">="} 300%</p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="font-semibold mb-3">Informações</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>• Máximo 10MB por arquivo</li>
              <li>• Formatos: .xlsx ou .xls</li>
              <li>• Processamento automático</li>
              <li>• Acionamentos gerados na hora</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 !mt-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-md shadow-2xl">

            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-bold">
                {result ? (result.success ? "Importação concluída" : "Erro na importação") : "Confirmar importação"}
              </h2>
              {!isLoading && (
                <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>

            <div className="p-6">
              {/* Resultado: sucesso */}
              {result?.success ? (
                <div className="text-center">
                  <div className="p-4 rounded-full bg-green-500/10 w-fit mx-auto mb-4">
                    <CheckCircle className="w-10 h-10 text-green-600" />
                  </div>
                  <p className="text-muted-foreground mb-6 text-sm">{result.message}</p>
                  <div className="bg-muted rounded-xl p-4 text-sm text-left space-y-3 mb-6">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Arquivo</span>
                      <span className="font-medium truncate max-w-[180px]">{result.file_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Linhas processadas</span>
                      <span className="font-medium">{result.rows_processed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Novos acionamentos</span>
                      <span className="font-semibold text-primary">{result.alerts_generated}</span>
                    </div>
                    {(result.alerts_skipped_done ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Já acionados (ignorados)</span>
                        <span className="font-medium">{result.alerts_skipped_done}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Link
                      href="/dashboard/alerts"
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      Ver Acionamentos <ArrowRight className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={closeModal}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" /> Nova importação
                    </button>
                  </div>
                </div>
              ) : result && !result.success ? (
                /* Resultado: erro da API */
                <div className="text-center">
                  <div className="p-4 rounded-full bg-destructive/10 w-fit mx-auto mb-4">
                    <AlertCircle className="w-10 h-10 text-destructive" />
                  </div>
                  <p className="text-muted-foreground text-sm mb-2">{result.message}</p>
                  {result.error && <p className="text-xs text-destructive mb-6">{result.error}</p>}
                  <button
                    onClick={() => { setResult(null); setError("") }}
                    className="w-full py-2.5 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 transition-colors"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : (
                /* Confirmação / loading */
                <>
                  {/* Info do arquivo */}
                  <div className="flex items-center gap-4 p-4 bg-muted rounded-xl mb-6">
                    <div className="p-2.5 bg-primary/10 rounded-lg flex-shrink-0">
                      <FileSpreadsheet className="w-6 h-6 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{file?.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {file ? formatBytes(file.size) : ""}
                      </p>
                    </div>
                  </div>

                  {/* Erro de validação */}
                  {error && (
                    <div className="flex gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm mb-4">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {error}
                    </div>
                  )}

                  {/* Loading */}
                  {isLoading ? (
                    <div className="text-center py-4">
                      <Loader className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                      <p className="text-sm text-muted-foreground">Processando planilha...</p>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <button
                        onClick={handleUpload}
                        className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                      >
                        Processar
                      </button>
                      <button
                        onClick={closeModal}
                        className="flex-1 py-2.5 bg-muted rounded-xl text-sm font-medium hover:bg-muted/80 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

