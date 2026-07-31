/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Integração ao sistema principal (31/07/2026): roda em subpath da mesma
  // origem (sistema.gestorasmart.com.br/guardiao), não em domínio/porta
  // próprios — necessário para o nginx rotear corretamente e para o login
  // unificado funcionar (mesmo localStorage, mesma origem).
  basePath: "/guardiao",
  // Imagem Docker enxuta — copia só o necessário para rodar (sem depender de
  // node_modules completo em produção).
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["xlsx"],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async headers() {
    return [
      {
        // Todas as rotas de API nunca ficam em cache
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, max-age=0',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
