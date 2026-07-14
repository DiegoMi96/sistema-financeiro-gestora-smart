import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

const ModuleContext = createContext(null)

// Definição dos módulos — nomes e permissões necessárias
export const MODULES = [
  {
    id:          'faturamento',
    label:       'Faturamento',
    description: 'Ciclos mensais, ajustes e controle de recebimentos',
    icon:        'FileText',
    color:       'blue',
    status:      'active',
    permission:  null,
    nav: [
      { to: '/dashboard', label: 'Painel', permission: 'can_view_dashboard' },
      { to: '/faturamento',        label: 'Faturamento'       },
      { to: '/clientes',           label: 'Clientes'          },
      { to: '/ajustes',            label: 'Ajustes',          permission: 'can_edit_billing' },
      { to: '/configuracoes',             label: 'Configurações',    permission: 'can_manage_users' },
    ],
  },
  {
    id:          'contestacao',
    label:       'Contestação',
    description: 'Comparação e contestação de cobranças das operadoras',
    icon:        'AlertCircle',
    color:       'orange',
    status:      'coming',
    permission:  'can_view_contestacao',
    nav: [
      { to: '/contestacao',        label: 'Contestações' },
      { to: '/contestacao/allcom', label: 'Pedidos Allcom' },
      { to: '/configuracoes', label: 'Configurações', permission: 'can_manage_users' },
    ],
  },
  {
    id:          'comissionamento',
    label:       'Comissionamento',
    description: 'Comissões de vendas e metas por vendedor',
    icon:        'TrendingUp',
    color:       'green',
    status:      'coming',
    permission:  'can_view_comissao',
    nav: [
      { to: '/configuracoes', label: 'Configurações', permission: 'can_manage_users' },
    ],
  },
  {
    id:          'logistica',
    label:       'Logística',
    description: 'Gestão de fretes, envios e pedidos de chips',
    icon:        'Truck',
    color:       'indigo',
    status:      'coming',
    permission:  'can_view_logistica',
    nav: [
      { to: '/logistica',     label: 'Logística' },
      { to: '/configuracoes', label: 'Configurações', permission: 'can_manage_users' },
    ],
  },
  {
    id:          'controladoria',
    label:       'Controladoria',
    description: 'DRE, fluxo de caixa, conciliação e relatórios gerenciais',
    icon:        'BarChart2',
    color:       'teal',
    status:      'active',
    permission:  'can_view_controladoria',
    nav: [
      { to: '/dashboard',     label: 'Painel',         permission: 'can_view_dashboard' },
      { to: '/faturamento',   label: 'Faturamento'                                      },
      { to: '/clientes',      label: 'Clientes'                                         },
      { to: '/ajustes',       label: 'Ajustes',        permission: 'can_edit_billing'   },
      { to: '/configuracoes', label: 'Configurações',  permission: 'can_manage_users'   },
    ],
  },
  {
    id:          'organograma',
    label:       'Organograma',
    description: 'Estrutura organizacional e equipe comercial da empresa',
    icon:        'Users',
    color:       'green',
    status:      'active',
    permission:  null,
    nav: [
      { to: '/organograma',           label: 'Organograma' },
      { to: '/organograma/gerenciar', label: 'Gerenciar',      permission: 'can_manage_users' },
      { to: '/configuracoes',         label: 'Configurações',  permission: 'can_manage_users' },
    ],
  },
]

export function ModuleProvider({ children }) {
  const { user, can } = useAuth()
  const [activeModule, setActiveModule] = useState(null)

  // Admin vê todos; demais veem apenas os que têm permissão
  const availableModules = MODULES.filter(
    m => !m.permission || can(m.permission)
  )

  // Se só tem acesso a um módulo, entra direto
  useEffect(() => {
    if (!user) return
    if (availableModules.length === 1) {
      setActiveModule(availableModules[0].id)
    }
  }, [user])

  const selectModule = (moduleId) => {
    setActiveModule(moduleId)
    sessionStorage.setItem('activeModule', moduleId)
  }

  const clearModule = () => {
    setActiveModule(null)
    sessionStorage.removeItem('activeModule')
  }

  useEffect(() => {
    if (!user) return
    const saved = sessionStorage.getItem('activeModule')
    if (saved && availableModules.find(m => m.id === saved)) {
      setActiveModule(saved)
    }
  }, [user])

  const currentModule = MODULES.find(m => m.id === activeModule) || null

  return (
    <ModuleContext.Provider value={{
      activeModule,
      currentModule,
      availableModules,
      selectModule,
      clearModule,
    }}>
      {children}
    </ModuleContext.Provider>
  )
}

export const useModule = () => useContext(ModuleContext)
