"use client";

// Login unificado (ver src/lib/mainAuth.ts): sem sessão do sistema principal,
// manda de volta pra raiz do domínio (onde mora o login), fora do basePath
// /estoque. Colocado no layout raiz para não repetir essa checagem em cada
// página — cada página só cuida de buscar seus próprios dados.
import { useEffect } from "react";
import { useMainUser } from "@/hooks/useMainUser";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, ready } = useMainUser();

  useEffect(() => {
    if (ready && !isAuthenticated) {
      window.location.href = "/";
    }
  }, [ready, isAuthenticated]);

  if (!ready || !isAuthenticated) return null;

  return <>{children}</>;
}
