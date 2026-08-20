"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// onClick opcional: páginas que buscam dado via API (ver src/lib/apiClient.ts)
// passam sua própria função de recarregar; sem isso, cai no router.refresh()
// padrão do Next.js (útil só pra páginas que ainda seriam Server Components).
export function RefreshButton({ onClick }: { onClick?: () => void }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={carregando}
      onClick={() => {
        setCarregando(true);
        if (onClick) onClick();
        else router.refresh();
        setTimeout(() => setCarregando(false), 600);
      }}
    >
      <RefreshCw className={carregando ? "animate-spin" : ""} />
      Atualizar agora
    </Button>
  );
}
