import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { ShieldOff } from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ModuleProvider, useModule } from './contexts/ModuleContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Layout from './components/layout/Layout'

// Páginas carregadas sob demanda — browser baixa apenas o chunk necessário
const WelcomePage              = lazy(() => import('./pages/WelcomePage'))
const LoginPage                = lazy(() => import('./pages/auth/LoginPage'))
const AnalystDashboard         = lazy(() => import('./pages/dashboard/AnalystDashboard'))
const BillingPage              = lazy(() => import('./pages/billing/BillingPage'))
const BillingCyclePage         = lazy(() => import('./pages/billing/BillingCyclePage'))
const ClientDetailPage         = lazy(() => import('./pages/billing/ClientDetailPage'))
const AdjustmentsPage          = lazy(() => import('./pages/billing/AdjustmentsPage'))
const ContestationPage         = lazy(() => import('./pages/contestation/ContestationPage'))
const ContestationCyclePage    = lazy(() => import('./pages/contestation/ContestationCyclePage'))
const AllcomPage               = lazy(() => import('./pages/contestation/AllcomPage'))
const UsersPage                = lazy(() => import('./pages/auth/UsersPage'))
const SettingsPage             = lazy(() => import('./pages/settings/SettingsPage'))
const ComissionamentoPage      = lazy(() => import('./pages/comissionamento/ComissionamentoPage'))
const ParceirosRegionaisPage   = lazy(() => import('./pages/comissionamento/ParceirosRegionaisPage'))
const ComissionamentoInternoPage = lazy(() => import('./pages/comissionamento/ComissionamentoInternoPage'))
const ClientsPage              = lazy(() => import('./pages/clients/ClientsPage'))
const OrganoPage               = lazy(() => import('./pages/organograma/OrganoPage'))
const IndicadoresPage          = lazy(() => import('./pages/controladoria/IndicadoresPage'))
const ControladoriaDashboard   = lazy(() => import('./pages/controladoria/ControladoriaDashboard'))
const AcessosPage              = lazy(() => import('./pages/acessos/AcessosPage'))
const DiagnosticoIAPage        = lazy(() => import('./pages/billing/DiagnosticoIAPage'))

// staleTime padrão: 5 min — dados financeiros não mudam a cada 30s
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60 * 1000 } }
})

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center text-gray-400 text-sm">
      Carregando...
    </div>
  )
}

function AccessDenied() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="text-center max-w-sm px-6">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldOff size={28} className="text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Acesso não permitido</h2>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Você não tem permissão para acessar esta área. Entre em contato com o administrador do sistema.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors"
        >
          Voltar ao início
        </button>
      </div>
    </div>
  )
}

// Rota privada: verifica login + permissão opcional
function PrivateRoute({ children, permission }) {
  const { user, can, loading } = useAuth()
  if (loading) return (
    <div className="flex h-screen items-center justify-center text-gray-400 text-sm">
      Carregando...
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (permission && !can(permission)) return <AccessDenied />
  return children
}

// Rota de módulo: se não tem módulo selecionado, manda para boas-vindas
function ModuleRoute({ children }) {
  const { user, loading } = useAuth()
  const { activeModule, availableModules } = useModule()

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />

  // Só 1 módulo disponível → já entrou direto, não precisa checar
  // Mais de 1 → precisa ter escolhido
  if (availableModules.length > 1 && !activeModule) {
    return <Navigate to="/" replace />
  }

  return children
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Público */}
        <Route path="/login" element={<LoginPage />} />

        {/* Tela de boas-vindas / seleção de módulo */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <WelcomePage />
            </PrivateRoute>
          }
        />

        {/* Comissionamento — sem ModuleRoute para não bloquear por activeModule */}
        <Route path="/comissionamento"           element={<PrivateRoute permission="can_view_com_painel"><ComissionamentoPage /></PrivateRoute>} />
        <Route path="/comissionamento/parceiros" element={<PrivateRoute permission="can_view_com_parceiros"><ParceirosRegionaisPage /></PrivateRoute>} />
        <Route path="/comissionamento/interno"   element={<PrivateRoute permission="can_view_com_interno"><ComissionamentoInternoPage /></PrivateRoute>} />

        {/* Controladoria — dashboard externo em iframe, sem sidebar */}
        <Route path="/controladoria/dash" element={<PrivateRoute permission="can_view_controladoria"><ControladoriaDashboard /></PrivateRoute>} />

        {/* Gestão de Acessos — página standalone, sem sidebar */}
        <Route path="/acessos" element={<PrivateRoute permission="can_manage_users"><AcessosPage /></PrivateRoute>} />

        {/* Área interna (com sidebar) */}
        <Route
          element={
            <ModuleRoute>
              <Layout />
            </ModuleRoute>
          }
        >
          {/* Dashboard */}
          <Route
            path="/dashboard"
            element={
              <PrivateRoute permission="can_view_dashboard">
                <AnalystDashboard />
              </PrivateRoute>
            }
          />
          <Route path="/dashboard-analista" element={<Navigate to="/dashboard" replace />} />

          {/* Clientes */}
          <Route path="/clientes" element={<ClientsPage />} />

          {/* Faturamento — rotas protegidas 01/08/2026 (antes ficavam sem
              PrivateRoute nenhum; bug que deixava Suporte Técnico ver
              Faturamento, ver ModuleContext.jsx e AcessosPage.jsx) */}
          <Route path="/faturamento"                              element={<PrivateRoute permission="can_view_fat_ciclos"><BillingPage /></PrivateRoute>} />
          <Route path="/faturamento/:cycleId"                     element={<PrivateRoute permission="can_view_fat_ciclo_detalhe"><BillingCyclePage /></PrivateRoute>} />
          <Route path="/faturamento/:cycleId/cliente/:idSmart"    element={<PrivateRoute permission="can_view_fat_cliente_detalhe"><ClientDetailPage /></PrivateRoute>} />
          <Route path="/ajustes"                                  element={<PrivateRoute permission="can_edit_billing"><AdjustmentsPage /></PrivateRoute>} />
          <Route path="/diagnostico-ia"                           element={<PrivateRoute permission="can_view_fat_diagnostico_ia"><DiagnosticoIAPage /></PrivateRoute>} />

          <Route path="/contestacao"             element={<PrivateRoute permission="can_view_cont_ciclos"><ContestationPage /></PrivateRoute>} />
          <Route path="/contestacao/allcom"      element={<PrivateRoute permission="can_view_cont_allcom"><AllcomPage /></PrivateRoute>} />
          <Route path="/contestacao/:cycleId"    element={<PrivateRoute permission="can_view_cont_ciclo_detalhe"><ContestationCyclePage /></PrivateRoute>} />
          <Route path="/logistica"     element={<PrivateRoute permission="can_view_logistica"><ComingSoon module="Logística" desc="Gestão de fretes, envios e pedidos de chips." /></PrivateRoute>} />
          <Route path="/controladoria" element={<Navigate to="/controladoria/indicadores" replace />} />
          <Route path="/controladoria/indicadores" element={<PrivateRoute permission="can_view_controladoria"><IndicadoresPage /></PrivateRoute>} />
          <Route path="/organograma"          element={<PrivateRoute permission="can_view_organograma"><OrganoPage /></PrivateRoute>} />
          <Route path="/organograma/gerenciar" element={<PrivateRoute permission="can_edit_organograma"><OrganoPage /></PrivateRoute>} />

          {/* Usuários */}
          <Route
            path="/usuarios"
            element={
              <PrivateRoute permission="can_manage_users">
                <UsersPage />
              </PrivateRoute>
            }
          />

          {/* Configurações */}
          <Route
            path="/configuracoes"
            element={
              <PrivateRoute permission="can_manage_users">
                <SettingsPage />
              </PrivateRoute>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  )
}

// Placeholder temporário para módulos ainda não construídos
function ComingSoon({ module, desc }) {
  return (
    <div className="flex flex-col items-center justify-center h-96 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
        <span className="text-2xl">🚧</span>
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">{module}</h2>
      <p className="text-gray-400 text-sm max-w-xs">
        {desc || 'Este módulo está sendo desenvolvido e estará disponível em breve.'}
      </p>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ModuleProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
            <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
          </ModuleProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
