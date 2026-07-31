export type UserRole = "admin" | "analyst" | "viewer"

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  created_at: string
  last_login?: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface Alert {
  id: string
  consumption_id: string
  status: "pending" | "completed"
  triggered_at: string
  marked_as_done_at?: string
  notes?: string
  line_number: string
  client_name: string
  operator: string
  usage_percentage: number
  competencia: string
}

export interface UploadResponse {
  import_id: string
  file_name: string
  rows_processed: number
  alerts_generated: number
  alerts_skipped_done?: number
  success: boolean
  message: string
  error?: string
}
