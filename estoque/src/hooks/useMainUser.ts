"use client";

// Login unificado com o sistema principal (gestora-smart) — mesmo padrão do
// Guardião (guardiao/src/hooks/useAuth.ts). Sem sessão do sistema principal
// (localStorage 'token' + 'user'), não há usuário: quem chama decide o que
// fazer (ver AuthGate, que redireciona para a raiz do domínio).
import { useEffect, useState } from "react";

export interface MainUser {
  id: number | string;
  name: string;
  email: string;
  role: string;
  role_label?: string;
}

export function useMainUser() {
  const [user, setUser] = useState<MainUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    const rawUser = localStorage.getItem("user");
    if (token && rawUser) {
      try {
        setUser(JSON.parse(rawUser) as MainUser);
      } catch {
        setUser(null);
      }
    } else {
      setUser(null);
    }
    setReady(true);
  }, []);

  function logout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/";
    }
  }

  return { user, isAuthenticated: !!user, ready, logout };
}
