"use client"

import { ReactNode } from "react"
import Sidebar from "@/components/layout/Sidebar"
import Navbar from "@/components/layout/Navbar"
import { useAuth } from "@/hooks/useAuth"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isInitialized } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Login unificado (31/07/2026): sem sessão do sistema principal, manda
    // direto para a raiz do sistema (não para /login do Guardião, que não
    // existe mais como tela própria).
    if (isInitialized && !isAuthenticated) {
      window.location.href = "/"
    }
  }, [isAuthenticated, isInitialized, router])

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  // h-screen + overflow-hidden (não min-h-screen) — mesmo padrão do sistema
  // principal (Layout.jsx): a sidebar fica com altura travada na viewport
  // inteira, então o botão de colapsar (absolute, bottom:28 relativo à
  // <aside>) fica ancorado no rodapé real da tela, não logo depois do
  // último item do menu. Sem isso, a página inteira rolava junto (inclusive
  // a sidebar saía da tela ao rolar) e o botão de colapsar ficava
  // sobreposto em cima do "Trocar módulo" — bug relatado pelo Diego em
  // 01/08/2026. Só o <main> rola agora; a sidebar fica estática.
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-auto bg-background">
          <div className="container mx-auto py-8 px-4 md:px-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
