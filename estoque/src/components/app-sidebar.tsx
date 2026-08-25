"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Boxes,
  Smartphone,
  Router,
  UploadCloud,
  Truck,
  CalendarDays,
  PackageOpen,
  Undo2,
  Ban,
  Banknote,
  LayoutGrid,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useMainUser } from "@/hooks/useMainUser";

const ACTIVE_CLASS =
  "font-medium data-active:bg-primary data-active:text-primary-foreground data-active:hover:bg-primary/90 data-active:hover:text-primary-foreground";

// Verde da marca — mesmo valor hardcoded do sistema principal
// (frontend/src/components/layout/Layout.jsx: const GRN).
const GRN = "#3CB54A";

const ESTOQUE_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/estoque-geral", label: "Estoque Geral", icon: Boxes },
  { href: "/estoque-smart", label: "Estoque SMART", icon: Smartphone },
  { href: "/estoque-smt", label: "Estoque SMT", icon: Router },
  { href: "/upload", label: "Upload de planilhas", icon: UploadCloud },
];

const SAIDA_ITEMS = [
  { href: "/saida", label: "Dashboard", icon: LayoutDashboard },
  { href: "/saida/resumo", label: "Resumo por operadora", icon: CalendarDays },
  { href: "/saida/do-dia", label: "Saída do dia", icon: PackageOpen },
  { href: "/saida/retornos", label: "Retornos e Reenvios", icon: Undo2 },
];

const CANCELAMENTO_ITEMS = [
  { href: "/cancelamento", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cancelamento/multa-contratual", label: "Multa Contratual", icon: Banknote },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { state, toggleSidebar } = useSidebar();
  const { user, logout } = useMainUser();
  const collapsed = state === "collapsed";
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  // Logo real da empresa (mesmo padrão do Faturamento, ver Layout.jsx) —
  // rota pública do backend principal, não precisa de token.
  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.empresa_logo) setCompanyLogo(d.empresa_logo); })
      .catch(() => {});
  }, []);

  // Mesmo padrão do sistema principal (Layout.jsx): volta pra tela de
  // seleção de módulo, limpando o módulo ativo salvo em sessionStorage.
  const handleSwitchModule = () => {
    try {
      sessionStorage.removeItem("activeModule");
    } catch {}
    window.location.href = "/";
  };

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <Sidebar collapsible="icon" className="border-r">
      {/* Logo — exatamente igual ao Faturamento (Layout.jsx): mesma logo
          real cadastrada em Configurações, mesmo recorte/posição/tamanho.
          Sem fallback em texto (pedido do Diego, 21/08/2026 — "deixa
          exatamente igual ao que está no Faturamento, tira o que está no
          lugar dele"). */}
      <SidebarHeader
        className="border-b"
        style={{ minHeight: 64, display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start" }}
      >
        {companyLogo && (
          collapsed ? (
            <img src={companyLogo} alt="Logo" style={{ width: 32, height: 32, objectFit: "contain" }} />
          ) : (
            <div style={{ width: 197, height: 48, overflow: "hidden", position: "relative" }}>
              <img src={companyLogo} alt="Logo" style={{ position: "absolute", top: -31, left: 2, height: 104, width: "auto" }} />
            </div>
          )
        )}
      </SidebarHeader>

      <SidebarContent className="gap-1 px-2 pt-2">
        <SidebarGroup>
          <SidebarGroupLabel>Estoque</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ESTOQUE_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    className={ACTIVE_CLASS}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>
            <Truck className="mr-1 size-3.5" />
            Controle de Saída
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {SAIDA_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    className={ACTIVE_CLASS}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>
            <Ban className="mr-1 size-3.5" />
            Controle de Cancelamento
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {CANCELAMENTO_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    className={ACTIVE_CLASS}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/configuracoes" />}
                  isActive={pathname === "/configuracoes"}
                  tooltip="Configurações"
                  className={ACTIVE_CLASS}
                >
                  <Settings />
                  <span>Configurações</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <ThemeToggle />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Trocar módulo + Perfil + Sair + colapsar — mesmo padrão/posição do
          sistema principal (Layout.jsx). Antes ficavam no TopBar (canto
          superior) — movidos pra cá em 20/08/2026 a pedido do Diego, pra
          ficar "exatamente igual" ao Faturamento. gap-0/p-0 zeram o padding
          padrão do componente (gap-2 p-2) pra bater com os valores exatos. */}
      <SidebarFooter className="gap-0 p-0" style={{ position: "relative" }}>
        <div style={{ padding: "0 8px 8px" }}>
          <button
            onClick={handleSwitchModule}
            title="Trocar módulo"
            style={{
              width: "100%", display: "flex", alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: collapsed ? 0 : 8,
              padding: collapsed ? "8px 0" : "7px 10px",
              borderRadius: 8, fontSize: 12, fontWeight: 500,
              color: "#6B7280", border: "1px dashed #D8DEE3",
              background: "transparent", cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#F3F4F6"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <LayoutGrid size={14} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Trocar módulo</span>}
          </button>
        </div>

        <div style={{ borderTop: "1px solid #E5E9ED", padding: collapsed ? "10px 6px" : "10px" }}>
          {collapsed ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div title={user?.name} style={{ width: 32, height: 32, borderRadius: "50%", background: "#1F3A23", color: GRN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                {initials}
              </div>
              <button
                onClick={logout}
                title="Sair da conta"
                style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", background: "transparent", border: "none", cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; e.currentTarget.style.color = "#EF4444"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6B7280"; }}
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 8, background: "#F6F8FA", marginBottom: 4 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1F3A23", color: GRN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: "#0F1B2D", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</p>
                  <p style={{ color: "#6B7280", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.role_label}</p>
                </div>
              </div>
              <button
                onClick={logout}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500, color: "#4A5868", background: "transparent", border: "none", cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; e.currentTarget.style.color = "#EF4444"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#4A5868"; }}
              >
                <LogOut size={13} />
                Sair da conta
              </button>
            </>
          )}
        </div>

        {/* Botão colapsar — canto inferior direito (mesmo padrão do sistema principal) */}
        <button
          onClick={toggleSidebar}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="hidden lg:flex absolute items-center justify-center"
          style={{
            right: -12, bottom: 28, zIndex: 10,
            width: 24, height: 24, borderRadius: "50%",
            background: "#FFFFFF", border: "1px solid #E5E9ED",
            color: "#4A5868", cursor: "pointer", transition: "all 0.15s",
            boxShadow: "0 2px 8px rgba(15,27,45,0.18)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = GRN; e.currentTarget.style.color = "#FFF"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.color = "#4A5868"; }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
