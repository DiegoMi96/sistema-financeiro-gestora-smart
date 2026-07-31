import apiClient from "./api"
import { useAuthStore } from "@/store/authStore"
import { LoginCredentials, TokenResponse, User } from "@/types"

export async function login(credentials: LoginCredentials) {
  const response = await apiClient.post<TokenResponse>("/auth/login", credentials)
  const { setTokens, setUser } = useAuthStore.getState()

  setTokens(response.data)

  // Fetch user info
  const userResponse = await apiClient.get<User>("/auth/me")
  setUser(userResponse.data)

  return userResponse.data
}

export async function logout() {
  const { clearAuth } = useAuthStore.getState()
  try {
    await apiClient.post("/auth/logout")
  } catch (error) {
    console.error("Error during logout:", error)
  } finally {
    clearAuth()
  }
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await apiClient.get<User>("/auth/me")
    return response.data
  } catch (error) {
    return null
  }
}

