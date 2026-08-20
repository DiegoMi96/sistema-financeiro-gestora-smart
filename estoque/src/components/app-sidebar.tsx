"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  Smartphone,
  Router,
  UploadCloud,
  PackageCheck,
  Truck,
  CalendarDays,
  PackageOpen,
  Undo2,
  Ban,
  Banknote,
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
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

const ACTIVE_CLASS =
  "font-medium data-active:bg-primary data-active:text-primary-foreground data-active:hover:bg-primary/90 data-active:hover:text-primary-foreground";

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

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="h-16 justify-center border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<div />} className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <PackageCheck className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-base font-bold">Controle de Estoque</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
      </SidebarContent>

      <SidebarFooter className="gap-1 border-t px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
