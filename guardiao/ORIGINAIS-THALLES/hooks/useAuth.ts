"use client"

import { useEffect, useState } from "react"
import { useAuthStore } from "@/store/authStore"
import * as authLib from "@/lib/auth"
import { User } from "@/types"

export function useAuth() {
  const [isInitialized, setIsInitialized] = useState(false)
  const { user, accessToken, isLoading, setUser, setTokens, clearAuth } = useAuthStore()

  // Initialize auth on mount
  useEffect(() => {
    const initialize = async () => {
      if (typeof window === "undefined") return

      // Check localStorage for tokens
      const savedAccessToken = localStorage.getItem("access_token")
      const savedRefreshToken = localStorage.getItem("refresh_token")

      if (savedAccessToken && savedRefreshToken) {
        useAuthStore.setState({
          accessToken: savedAccessToken,
          refreshToken: savedRefreshToken,
        })

        // Try to get current user
        const currentUser = await authLib.getCurrentUser()
        if (currentUser) {
          setUser(currentUser)
        } else {
          clearAuth()
        }
      }

      setIsInitialized(true)
    }

    initialize()
  }, [setUser, clearAuth])

  return {
    user,
    isAuthenticated: !!accessToken,
    isLoading,
    isInitialized,
    login: authLib.login,
    logout: authLib.logout,
  }
}
