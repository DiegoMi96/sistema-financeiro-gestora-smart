"use client"

// Login unificado com o sistema principal (gestora-smart) — 31/07/2026.
// O Guardião não tem mais login próprio: lê a MESMA sessão (localStorage
// 'token' + 'user') que o app principal grava, já que ambos rodam na mesma
// origem (sistema.gestorasmart.com.br, Guardião em /guardiao). Sem sessão do
// sistema principal, trata como não-autenticado (dashboard/layout.tsx manda
// de volta para o sistema principal).
import { useEffect, useState } from "react"
import { useAuthStore } from "@/store/authStore"
import { mapMainRoleToGuardiao } from "@/lib/roleMap"
import { User } from "@/types"

interface MainUser {
  id: number | string
  name: string
  email: string
  role: string
  is_active: boolean
  created_at?: string
  permissions?: Record<string, boolean>
}

export function useAuth() {
  const [isInitialized, setIsInitialized] = useState(false)
  const { user, accessToken, isLoading, setUser, clearAuth } = useAuthStore()

  useEffect(() => {
    if (typeof window === "undefined") return

    const mainToken = localStorage.getItem("token")
    const mainUserRaw = localStorage.getItem("user")

    if (mainToken && mainUserRaw) {
      try {
        const mainUser: MainUser = JSON.parse(mainUserRaw)
        const adapted: User = {
          id: String(mainUser.id),
          email: mainUser.email,
          full_name: mainUser.name,
          role: mapMainRoleToGuardiao(mainUser.role),
          is_active: mainUser.is_active,
          created_at: mainUser.created_at ?? new Date().toISOString(),
          permissions: mainUser.permissions ?? {},
        }
        useAuthStore.setState({ accessToken: mainToken })
        setUser(adapted)
      } catch {
        clearAuth()
      }
    } else {
      clearAuth()
    }

    setIsInitialized(true)
  }, [setUser, clearAuth])

  async function logout() {
    // Desloga do sistema principal por completo (mesma sessão compartilhada).
    if (typeof window !== "undefined") {
      localStorage.removeItem("token")
      localStorage.removeItem("user")
    }
    clearAuth()
  }

  return {
    user,
    isAuthenticated: !!accessToken,
    isLoading,
    isInitialized,
    logout,
  }
}
