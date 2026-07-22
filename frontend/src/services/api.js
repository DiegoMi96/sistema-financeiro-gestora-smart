import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({ baseURL: API_URL })

// Injeta token em toda requisição
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redireciona para login se 401
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Auth ─────────────────────────────────────────────────────
export const authApi = {
  login:  (email, password) => api.post('/auth/login', new URLSearchParams({ username: email, password })),
  me:     ()                => api.get('/auth/me'),
  users:  ()                => api.get('/auth/users'),
  createUser: (data)        => api.post('/auth/users', data),
  updateUser: (id, data)    => api.put(`/auth/users/${id}`, data),
  deleteUser: (id)          => api.delete(`/auth/users/${id}`),
  changePassword: (data)    => api.post('/auth/change-password', data),
}

// ── Dashboard ─────────────────────────────────────────────────
export const dashboardApi = {
  summary:        ()         => api.get('/dashboard/summary'),
  cycleBreakdown: (cycleId)  => api.get(`/dashboard/cycles/${cycleId}/breakdown`),
  statusEvolution:  ()        => api.get("/dashboard/status-evolution"),
  executiveSummary: ()        => api.get("/dashboard/executive-summary"),
}

// ── Faturamento ───────────────────────────────────────────────
export const billingApi = {
  cycles:          ()                        => api.get('/billing/cycles'),
  cycle:           (id)                      => api.get(`/billing/cycles/${id}`),
  approveCycle:    (id)                      => api.post(`/billing/cycles/${id}/approve`),
  processBilling:  (year, month, formData)   => api.post(`/billing/cycles/process?year=${year}&month=${month}`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 }),
  clients:         (cycleId, params)         => api.get(`/billing/cycles/${cycleId}/clients`, { params }),
  allAdjustments:  (params)                  => api.get('/billing/adjustments', { params }),
  adjustments:     (cycleId)                 => api.get(`/billing/cycles/${cycleId}/adjustments`),
  createAdjustment:(cycleId, data)           => api.post(`/billing/cycles/${cycleId}/adjustments`, data),
  approveAdjustment:(cycleId, adjId, data)   => api.put(`/billing/cycles/${cycleId}/adjustments/${adjId}/approve`, data),
  deleteCycle:     (cycleId)                 => api.delete(`/billing/cycles/${cycleId}`),
  exportExcel:        (cycleId)              => api.get(`/billing/cycles/${cycleId}/export/excel`, { responseType: 'blob', timeout: 600000 }),
  startExcelExport:   (cycleId)             => api.post(`/billing/cycles/${cycleId}/export/excel/start`),
  excelExportStatus:  (cycleId, taskId)     => api.get(`/billing/cycles/${cycleId}/export/excel/status?task_id=${taskId}`),
  excelDownloadFile:  (cycleId, taskId)     => api.get(`/billing/cycles/${cycleId}/export/excel/file?task_id=${taskId}`, { responseType: 'blob', timeout: 120000 }),
  exportPdf:          (cycleId, idSmart)     => api.get(`/billing/cycles/${cycleId}/clients/${idSmart}/pdf`, { responseType: 'blob', timeout: 120000 }),
  exportClientExcel:  (cycleId, idSmart)     => api.get(`/billing/cycles/${cycleId}/clients/${idSmart}/excel`, { responseType: 'blob', timeout: 120000 }),
  exportRemessa:         (cycleId, formData) => api.post(`/billing/cycles/${cycleId}/export/remessa`, formData, { responseType: 'blob', headers: { 'Content-Type': 'multipart/form-data' } }),
  exportRemessaTemplate: (cycleId)          => api.get(`/billing/cycles/${cycleId}/export/remessa-template`, { responseType: 'blob' }),
  exportVencimentos:  (cycleId)              => api.get(`/billing/cycles/${cycleId}/export/vencimentos`, { responseType: 'blob' }),
  breakdown:          (cycleId)              => api.get(`/billing/cycles/${cycleId}/breakdown`),
  clientLines:        (cycleId, idSmart, params) => api.get(`/billing/cycles/${cycleId}/clients/${idSmart}/lines`, { params }),
  clientSummary:      (cycleId, idSmart)         => api.get(`/billing/cycles/${cycleId}/clients/${idSmart}/summary`),
}

// ── Analyst ───────────────────────────────────────────────────
export const analystApi = {
  weeklyAgenda:       ()         => api.get('/analyst/weekly-agenda'),
  alerts:             ()         => api.get('/analyst/alerts'),
  registerPayment:    (data)     => api.post('/analyst/payments', data),
  updateDueDate:      (data)     => api.put('/analyst/due-date', data),
  payments:           (cycleId, idSmart) => api.get(`/analyst/payments/${cycleId}/${idSmart}`),
  paymentPlanning:    (month, year)      => api.get(`/analyst/payment-planning?month=${month}&year=${year}`),
  vencidosNotas:      (month, year)      => api.get(`/analyst/vencidos-notas?mes=${month}&ano=${year}`),
  upsertVencidoNota:  (cnpj, month, year, data) => api.put(`/analyst/vencidos-notas/${cnpj}?mes=${month}&ano=${year}`, data),
}

// ── Settings / Roles ──────────────────────────────────────────
export const settingsApi = {
  getRoles:              ()           => api.get('/settings/roles'),
  updateRolePermissions: (role, data) => api.put(`/settings/roles/${role}`, data),
}

// ── Asaas ─────────────────────────────────────────────────────
export const asaasApi = {
  payments:    (idSmart)  => api.get(`/asaas/payments/${idSmart}`),
  syncBoletos: (cycleId)  => api.post(`/asaas/cycles/${cycleId}/sync-boletos`),
}

// ── Clientes ──────────────────────────────────────────────────
export const clientsApi = {
  list:        (params)          => api.get('/clients', { params }),
  get:         (idSmart)         => api.get(`/clients/${idSmart}`),
  update:      (idSmart, data)   => api.patch(`/clients/${idSmart}`, data),
  export:      ()                => api.get('/clients/export', { responseType: 'blob' }),
  import:      (formData)        => api.post('/clients/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  // Bancos
  banks:       ()                => api.get('/clients/banks'),
  createBank:  (data)            => api.post('/clients/banks', data),
  updateBank:  (id, data)        => api.patch(`/clients/banks/${id}`, data),
  deleteBank:  (id)              => api.delete(`/clients/banks/${id}`),
}

export default api

// ── Organograma ───────────────────────────────────────────────
export const orgApi = {
  tree:        (view)         => api.get(`/organograma/tree?view=${view}`),
  members:     ()             => api.get('/organograma/members'),
  create:      (data)         => api.post('/organograma/members', data),
  update:      (id, data)     => api.put(`/organograma/members/${id}`, data),
  remove:      (id)           => api.delete(`/organograma/members/${id}`),
  uploadPhoto:  (id, formData) => api.post(`/organograma/members/${id}/photo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  removePhoto:  (id)           => api.delete(`/organograma/members/${id}/photo`),
}
