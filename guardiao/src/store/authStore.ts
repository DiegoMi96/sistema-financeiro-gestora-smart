import { create } from "zustand"
import { User, TokenResponse } from "@/types"

interface AuthStore {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isLoading: boolean
  error: string | null

  setUser: (user: User | null) => void
  setTokens: (tokens: TokenResponse) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user }),

  setTokens: (tokens) => {
    set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    })
    // Persist tokens to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("access_token", tokens.access_token)
      localStorage.setItem("refresh_token", tokens.refresh_token)
    }
  },

  clearAuth: () => {
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
    })
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token")
      localStorage.removeItem("refresh_token")
    }
  },

  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  isAuthenticated: () => {
    const { accessToken } = get()
    return !!accessToken
  },
}))
