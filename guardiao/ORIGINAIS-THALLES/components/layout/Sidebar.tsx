"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
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
  TrendingUp,
  Zap,
  GitCommitHorizontal,
  Send,
} from "lucide-react"

interface MenuItem {
  title: string
  href?: string
  icon: any
  roles: string[]
  submenu?: MenuItem[]
}

const menuItems: MenuItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: BarChart3,
    roles: ["admin", "supervisor", "analyst"],
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
      },
      {
        title: "Linha do Tempo",
        href: "/dashboard/timeline",
        icon: GitCommitHorizontal,
        roles: ["admin", "supervisor", "analyst"],
      },
      {
        title: "Consumo Crítico",
        href: "/dashboard/analises",
        icon: Zap,
        roles: ["admin", "supervisor", "analyst"],
      },
      {
        title: "Histórico de Envios",
        href: "/dashboard/envios",
        icon: Send,
        roles: ["admin", "supervisor", "analyst"],
      },
      {
        title: "Não Acionados",
        href: "/dashboard/nao-acionados",
        icon: AlertCircle,
        roles: ["admin", "supervisor", "analyst"],
      },
    ],
  },
  {
    title: "Importar Planilha",
    href: "/dashboard/upload",
    icon: Cloud,
    roles: ["admin", "supervisor", "analyst"],
  },
  {
    title: "Acionamentos",
    href: "/dashboard/alerts",
    icon: AlertCircle,
    roles: ["admin", "supervisor", "analyst"],
  },
  {
    title: "Histórico de Acionamentos",
    href: "/dashboard/history",
    icon: History,
    roles: ["admin", "supervisor", "analyst"],
  },
  {
    title: "Histórico Mensal",
    href: "/dashboard/historico-acionamentos",
    icon: History,
    roles: ["admin", "supervisor", "analyst"],
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
      },
    ],
  },
  {
    title: "Usuários",
    href: "/dashboard/users",
    icon: Users,
    roles: ["admin"],
  },
  {
    title: "Regras de Consumo",
    href: "/dashboard/configuracoes",
    icon: Settings,
    roles: ["admin"],
  },
]

function MenuItemComponent({
  item,
  pathname,
}: {
  item: MenuItem
  pathname: string
  user: any
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
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
            isOpen || item.submenu?.some((sub) => pathname === sub.href)
              ? "bg-muted text-foreground"
              : "text-foreground hover:bg-muted"
          }`}
        >
          <Icon className="w-5 h-5" />
          <span className="flex-1 text-left">{item.title}</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {isOpen && (
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
      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-foreground hover:bg-muted"
      }`}
    >
      <Icon className="w-5 h-5" />
      <span>{item.title}</span>
    </Link>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuth()

  const visibleItems = menuItems.filter((item) => {
    if (!user) return false
    return item.roles.includes(user.role)
  })

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link href="/dashboard/v2" className="flex items-center gap-2.5">
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
          <span className="text-xl font-bold">Guardião</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {visibleItems.map((item) => (
          <MenuItemComponent
            key={item.title}
            item={item}
            pathname={pathname}
            user={user}
          />
        ))}
      </nav>

    </aside>
  )
}
