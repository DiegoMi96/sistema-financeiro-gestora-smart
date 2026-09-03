"use client";

// Guarda de permissão por página (granular, 26/08/2026) — diferente do
// AuthGate (que só checa se há sessão válida, uma vez no layout raiz), este
// componente checa uma permissão específica (ex: can_view_est_upload) e
// cobre o caso de alguém digitar a URL direto sem ter aquele item liberado
// na tela de Acessos. `user.permissions` já vem pronto do /auth/login do
// sistema principal (ver useMainUser.ts) — sem chamada extra.
import { ShieldOff } from "lucide-react";
import { useMainUser } from "@/hooks/useMainUser";
import { PageHeader } from "@/components/page-header";

export function PermissionGate({
  permission,
  title,
  children,
}: {
  permission: string;
  title: string;
  children: React.ReactNode;
}) {
  const { user, ready } = useMainUser();

  if (!ready) return null;

  const allowed = user?.permissions?.[permission] ?? false;
  if (!allowed) {
    return (
      <>
        <PageHeader title={title} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <ShieldOff className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Sem permissão para acessar esta página</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Fale com um administrador para liberar o acesso, se precisar.
            </p>
          </div>
        </div>
      </>
    );
  }

  return <>{children}</>;
}
