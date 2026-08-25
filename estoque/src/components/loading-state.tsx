import { Loader } from "lucide-react";

// Mesmo padrão visual usado no Guardião (dashboard/page.tsx, configuracoes/page.tsx
// etc.) — spinner centralizado + texto, no lugar dos Skeletons genéricos.
export function LoadingState({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="py-16 text-center">
      <Loader className="mx-auto mb-4 size-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
