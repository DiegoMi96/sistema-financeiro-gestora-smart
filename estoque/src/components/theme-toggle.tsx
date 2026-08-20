"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Padrão recomendado pelo next-themes: o tema real só existe no client,
    // então evitamos usá-lo até depois da hidratação para não gerar mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <SidebarMenuButton
      tooltip={isDark ? "Tema claro" : "Tema escuro"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun /> : <Moon />}
      <span>{isDark ? "Tema claro" : "Tema escuro"}</span>
    </SidebarMenuButton>
  );
}
