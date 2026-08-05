"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import {
  BarChart3,
  Cloud,
  AlertCircle,
  History,
  Users,
  Settings,
  Shield,
  Database,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Zap,
  GitCommitHorizontal,
  Send,
  LayoutGrid,
} from "lucide-react"

interface MenuItem {
  title: string
  href?: string
  icon: any
  roles: string[]
  // Permissão granular do sistema principal (login unificado, 31/07/2026).
  // Itens-container (com submenu, sem href próprio) não têm permKey — a
  // visibilidade deles deriva de ter pelo menos um filho visível.
  permKey?: string
  submenu?: MenuItem[]
}

const menuItems: MenuItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: BarChart3,
    roles: ["admin", "supervisor", "analyst"],
    permKey: "can_view_grd_dashboard",
  },
  {
    title: "Monitoramento",
    icon: TrendingUp,
    roles: ["admin", "supervisor", "analyst"],
    submenu: [
      {
        title: "Histórico de Importes",
        href: "/dashboard/importacoes",
        icon: Cloud,
        roles: ["admin", "supervisor", "analyst"],
        permKey: "can_view_grd_importacoes",
      },
      {
        title: "Linha do Tempo",
        href: "/dashboard/timeline",
        icon: GitCommitHorizontal,
        roles: ["admin", "supervisor", "analyst"],
        permKey: "can_view_grd_timeline",
      },
      {
        title: "Consumo Crítico",
        href: "/dashboard/analises",
        icon: Zap,
        roles: ["admin", "supervisor", "analyst"],
        permKey: "can_view_grd_analises",
      },
      {
        title: "Histórico de Envios Diário",
        href: "/dashboard/envios",
        icon: Send,
        roles: ["admin", "supervisor", "analyst"],
        permKey: "can_view_grd_envios",
      },
      {
        title: "Não Acionados",
        href: "/dashboard/nao-acionados",
        icon: AlertCircle,
        roles: ["admin", "supervisor", "analyst"],
        permKey: "can_view_grd_nao_acionados",
      },
    ],
  },
  {
    title: "Importar Planilha",
    href: "/dashboard/upload",
    icon: Cloud,
    roles: ["admin", "supervisor", "analyst"],
    permKey: "can_view_grd_upload",
  },
  {
    title: "Acionamentos",
    href: "/dashboard/alerts",
    icon: AlertCircle,
    roles: ["admin", "supervisor", "analyst"],
    permKey: "can_view_grd_alerts",
  },
  {
    title: "Histórico de Acionamentos",
    href: "/dashboard/history",
    icon: History,
    roles: ["admin", "supervisor", "analyst"],
    permKey: "can_view_grd_history",
  },
  {
    title: "Cadastros",
    icon: Database,
    roles: ["admin"],
    submenu: [
      {
        title: "Clientes",
        href: "/dashboard/cadastros/clientes",
        icon: Users,
        roles: ["admin"],
        permKey: "can_view_grd_clientes",
      },
    ],
  },
  // "Usuários" removida do menu (31/07/2026): login unificado com o sistema
  // principal — a tabela de usuários própria do Guardião não controla mais
  // acesso real, então essa aba ficou vestigial/confusa. Página e API
  // continuam existindo (não apagadas), só não aparecem mais no menu.
  {
    title: "Regras de Consumo",
    href: "/dashboard/configuracoes",
    icon: Settings,
    roles: ["admin"],
    permKey: "can_view_grd_configuracoes",
  },
]

function MenuItemComponent({
  item,
  pathname,
  collapsed,
}: {
  item: MenuItem
  pathname: string
  user: any
  collapsed: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const Icon = item.icon
  const isActive = pathname === item.href
  const hasSubmenu = item.submenu && item.submenu.length > 0

  if (hasSubmenu) {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          title={collapsed ? item.title : undefined}
          className={`relative group w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
            collapsed ? "justify-center px-0" : ""
          } ${
            isOpen || item.submenu?.some((sub) => pathname === sub.href)
              ? "bg-muted text-foreground"
              : "text-foreground hover:bg-muted"
          }`}
        >
          <Icon className="w-5 h-5 flex-shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.title}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </>
          )}
          {collapsed && (
            <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap rounded-md bg-foreground text-background text-xs font-medium px-2.5 py-1.5 shadow-lg">
              {item.title}
            </span>
          )}
        </button>

        {isOpen && !collapsed && (
          <div className="ml-4 mt-2 space-y-1 border-l border-border pl-4">
            {item.submenu?.map((subitem) => {
              const SubIcon = subitem.icon
              const isSubActive = pathname === subitem.href

              return (
                <Link
                  key={subitem.href}
                  href={subitem.href || "#"}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                    isSubActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <SubIcon className="w-4 h-4" />
                  <span>{subitem.title}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href={item.href || "#"}
      title={collapsed ? item.title : undefined}
      className={`relative group flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
        collapsed ? "justify-center px-0" : ""
      } ${
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-foreground hover:bg-muted"
      }`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {!collapsed && <span>{item.title}</span>}
      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap rounded-md bg-foreground text-background text-xs font-medium px-2.5 py-1.5 shadow-lg">
          {item.title}
        </span>
      )}
    </Link>
  )
}

// Visível se: item-folha com permKey concedida, ou item-container (submenu)
// com pelo menos um filho visível. Sem permissões carregadas => nada aparece.
function isItemVisible(item: MenuItem, user: any): boolean {
  if (!user) return false
  if (item.permKey) return !!user.permissions?.[item.permKey]
  if (item.submenu) return item.submenu.some((sub) => isItemVisible(sub, user))
  return false
}

// Chave compartilhada com o sistema principal (frontend/src/components/layout/Layout.jsx)
// — mesma origem, mesmo localStorage: colapsar num sistema reflete no outro.
const SIDEBAR_COLLAPSED_KEY = "sidebar_collapsed"

export default function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true")
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }

  // "Trocar módulo" (mesmo padrão do sistema principal, 01/08/2026): volta
  // pra tela de seleção de módulo do sistema principal. Mesma origem, então
  // dá pra limpar o módulo ativo salvo em sessionStorage antes de navegar,
  // pra não cair de volta direto no Guardião.
  const handleSwitchModule = () => {
    try {
      sessionStorage.removeItem("activeModule")
    } catch {}
    window.location.href = "/"
  }

  const visibleItems = menuItems
    .filter((item) => isItemVisible(item, user))
    .map((item) =>
      item.submenu
        ? { ...item, submenu: item.submenu.filter((sub) => isItemVisible(sub, user)) }
        : item
    )

  return (
    <aside
      className={`relative ${collapsed ? "w-14" : "w-64"} bg-card border-r border-border flex flex-col transition-all duration-200 ease-in-out`}
    >
      {/* Logo */}
      <div className={`border-b border-border flex items-center ${collapsed ? "justify-center p-3" : "p-6"}`}>
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="9" fill="url(#sidebar-grad)"/>
            <path d="M20 7L9 12V20.5C9 27 13.5 32.5 20 34.5C26.5 32.5 31 27 31 20.5V12L20 7Z" fill="white" fillOpacity="0.95"/>
            <path d="M15 21L18 24L25 17" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <defs>
              <linearGradient id="sidebar-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#7ABA4F"/>
                <stop offset="100%" stopColor="#4E8A2F"/>
              </linearGradient>
            </defs>
          </svg>
          {!collapsed && <span className="text-xl font-bold">Guardião</span>}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto overflow-x-hidden">
        {visibleItems.map((item) => (
          <MenuItemComponent
            key={item.title}
            item={item}
            pathname={pathname}
            user={user}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* Trocar módulo */}
      <div className="p-2 pb-3">
        <button
          onClick={handleSwitchModule}
          title="Trocar módulo"
          className={`relative group w-full flex items-center gap-2 rounded-lg text-xs font-medium text-muted-foreground border border-dashed border-border hover:bg-muted transition-colors ${
            collapsed ? "justify-center px-0 py-2" : "px-2.5 py-1.5"
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5 flex-shrink-0" />
          {!collapsed && <span>Trocar módulo</span>}
          {collapsed && (
            <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap rounded-md bg-foreground text-background text-xs font-medium px-2.5 py-1.5 shadow-lg">
              Trocar módulo
            </span>
          )}
        </button>
      </div>

      {/* Botão colapsar — canto inferior direito (mesmo padrão do sistema principal) */}
      <button
        onClick={toggleCollapsed}
        title={collapsed ? "Expandir menu" : "Recolher menu"}
        className="hidden lg:flex absolute items-center justify-center rounded-full transition-colors"
        style={{
          right: -12, bottom: 28, zIndex: 10,
          width: 24, height: 24,
          background: "#2A2A2A", border: "1px solid #3A3A3A", color: "#9CA3AF",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#3CB54A"; e.currentTarget.style.color = "#FFF" }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "#2A2A2A"; e.currentTarget.style.color = "#9CA3AF" }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  )
}
