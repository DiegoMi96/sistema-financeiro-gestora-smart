import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

const ModuleContext = createContext(null)

// Definição dos módulos — nomes e permissões necessárias
// Linha 1 (4): Faturamento · Comissionamento · Controladoria · SMT
// Linha 2 (4): Logística · Guardião · Organograma · Gestão de Acessos
// Guardião ocupa o antigo lugar do SMT no array; SMT passou para o lado da
// Controladoria (pedido do Diego em 31/07/2026, integração do Guardião).
// Contestação removida do grid (pedido do Diego em 31/07/2026, "por
// enquanto") — objeto mantido comentado abaixo para restaurar fácil depois.
// A rota /contestacao e as permissões NÃO foram tocadas, só o card sumiu.
export const MODULES = [
  {
    id:          'faturamento',
    label:       'Faturamento',
    description: 'Ciclos mensais, ajustes e controle de recebimentos',
    icon:        'FileText',
    color:       'blue',
    status:      'active',
    // Corrigido 01/08/2026: estava `null` (nenhuma permissão associada), o que
    // deixava o card e as rotas de Faturamento visíveis para QUALQUER usuário
    // logado — foi assim que um usuário de Suporte Técnico viu o Faturamento
    // mesmo com can_view_faturamento=False. Ver App.jsx e AcessosPage.jsx.
    permission:  'can_view_faturamento',
    nav: [
      { to: '/dashboard', label: 'Painel', permission: 'can_view_dashboard' },
      { to: '/faturamento',        label: 'Faturamento',      permission: 'can_view_fat_ciclos' },
      { to: '/clientes',           label: 'Clientes'          },
      { to: '/ajustes',            label: 'Ajustes',          permission: 'can_edit_billing' },
      { to: '/diagnostico-ia',     label: 'Diagnóstico IA',   permission: 'can_view_fat_diagnostico_ia' },
      { to: '/configuracoes',      label: 'Configurações',    permission: 'can_manage_users' },
    ],
  },
  /* Contestação — removida do grid "por enquanto" (31/07/2026). Descomentar
     para restaurar o card (lembrar de reajustar o grid em WelcomePage.jsx).
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
  */
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
    id:          'controladoria',
    label:       'Controladoria',
    description: 'DRE, fluxo de caixa, conciliação e relatórios gerenciais',
    icon:        'BarChart2',
    color:       'teal',
    status:      'active',
    permission:  'can_view_controladoria',
    nav: [
      { to: '/dashboard',               label: 'Painel',        permission: 'can_view_dashboard' },
      { to: '/controladoria/indicadores',label: 'Indicadores'                                    },
      { to: '/faturamento',             label: 'Faturamento'                                     },
      { to: '/clientes',                label: 'Clientes'                                        },
      { to: '/ajustes',                 label: 'Ajustes',       permission: 'can_edit_billing'   },
      { to: '/configuracoes',           label: 'Configurações', permission: 'can_manage_users'   },
    ],
  },
  {
    id:          'smt',
    label:       'SMT',
    description: 'Dashboard financeiro SMT — cotações, resultados e operações Brasil e Portugal',
    icon:        'Globe2',
    color:       'violet',
    status:      'active',
    permission:  'can_view_smt',
    nav: [],
  },
  {
    id:          'logistica',
    label:       'Logística',
    description: 'Gestão de fretes, envios e pedidos de chips por operadora',
    icon:        'Truck',
    color:       'indigo',
    status:      'coming',
    permission:  'can_view_logistica',
    nav: [
      { to: '/logistica', label: 'Logística' },
      { to: '/configuracoes', label: 'Configurações', permission: 'can_manage_users' },
    ],
  },
  {
    id:          'guardiao',
    label:       'Guardião',
    description: 'Controle de consumo de franquias e acionamentos de linhas móveis',
    icon:        'ShieldCheck',
    color:       'emerald',
    status:      'active',
    permission:  'can_view_guardiao',
    nav: [],
  },
  {
    id:          'organograma',
    label:       'Organograma',
    description: 'Estrutura organizacional e equipe comercial da empresa',
    icon:        'Users',
    color:       'green',
    status:      'active',
    permission:  'can_view_organograma',
    nav: [
      { to: '/organograma',           label: 'Organograma' },
      { to: '/organograma/gerenciar', label: 'Gerenciar',      permission: 'can_edit_organograma' },
    ],
  },
  {
    id:          'acessos',
    label:       'Gestão de Acessos',
    description: 'Criação de usuários, perfis e permissões de todos os cards e abas do sistema',
    icon:        'Shield',
    color:       'slate',
    status:      'active',
    permission:  'can_manage_users',
    nav: [],
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
