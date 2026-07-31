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

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { accessToken, refreshToken, clearAuth, setTokens } = useAuthStore.getState()

    if (error.response?.status === 401 && refreshToken) {
      try {
        const response = await axios.post(`${API_URL}/v1/auth/refresh`, {
          refresh_token: refreshToken,
        })
        setTokens(response.data)
        return apiClient.request(error.config)
      } catch (refreshError) {
        clearAuth()
        window.location.href = "/login"
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient
