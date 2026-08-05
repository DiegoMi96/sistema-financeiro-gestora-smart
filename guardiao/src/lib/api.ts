import axios from "axios"
import { useAuthStore } from "@/store/authStore"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api"

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    const { accessToken } = useAuthStore.getState()
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor — login unificado (31/07/2026): não existe mais
// refresh token nesse modelo (a sessão é a mesma do sistema principal, via
// localStorage 'token'/'user'). Um 401 aqui significa que esse token expirou
// ou ficou inválido — desloga de vez (limpa a sessão compartilhada) e manda
// de volta pro sistema principal, em vez de deixar o erro passar em silêncio.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const { clearAuth } = useAuthStore.getState()
      clearAuth()
      if (typeof window !== "undefined") {
        localStorage.removeItem("token")
        localStorage.removeItem("user")
        window.location.href = "/"
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient
