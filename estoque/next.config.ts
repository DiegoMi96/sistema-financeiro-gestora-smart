import type { NextConfig } from "next";

// Integração ao sistema principal: roda em subpath da mesma origem
// (sistema.gestorasmart.com.br/estoque), sem DNS/subdomínio próprio —
// necessário para o nginx rotear corretamente e para o login unificado
// funcionar (mesmo localStorage, mesma origem). Mesmo padrão do Guardião.
const nextConfig: NextConfig = {
  basePath: "/estoque",
  // O nginx (location /estoque/ + proxy_pass) força redirect 301 sem-barra
  // -> com-barra; o Next.js por padrão faz o oposto na raiz do basePath —
  // sem isto os dois entram em loop (ERR_TOO_MANY_REDIRECTS), mesmo bug já
  // corrigido na integração do Guardião.
  trailingSlash: true,
  output: "standalone",
  serverExternalPackages: ["xlsx"],
};

export default nextConfig;
