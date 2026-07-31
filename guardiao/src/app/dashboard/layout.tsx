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

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Navbar />
        <main className="flex-1 overflow-auto bg-background">
          <div className="container mx-auto py-8 px-4 md:px-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
