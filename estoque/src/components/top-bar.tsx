"use client";

import { LogOut, UserRound } from "lucide-react";
import { useMainUser } from "@/hooks/useMainUser";

// Login unificado com o sistema principal — mostra o usuário da sessão
// compartilhada (localStorage 'user') e desloga dos dois sistemas de vez
// (mesma sessão), voltando pra raiz do domínio.
export function TopBar() {
  const { user, logout } = useMainUser();

  return (
    <div className="flex h-16 shrink-0 items-center justify-end gap-3 border-b bg-background px-4 md:px-6">
      <div className="flex items-center gap-2 text-right">
        <div className="hidden sm:block">
          <p className="text-sm leading-tight font-semibold">{user?.name ?? "—"}</p>
          <p className="text-xs leading-tight text-muted-foreground">{user?.email ?? ""}</p>
        </div>
        <div className="flex size-8 items-center justify-center rounded-full bg-muted">
          <UserRound className="size-4 text-muted-foreground" />
        </div>
      </div>
      <button
        type="button"
        title="Sair da conta"
        onClick={logout}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
