# Controle de Estoque — Next.js 16 (App Router), build standalone.
# Integração ao sistema principal: container próprio, atrás do nginx do
# sistema principal em /estoque (ver next.config.ts: basePath). Mesmo padrão
# usado na integração do Guardião — Next.js 16 exige Node 20.9+, por isso
# node:22-alpine (o Guardião, em Next 14, ainda usa node:18-alpine).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* precisa existir em BUILD TIME (Next.js embute o valor no
# bundle do cliente — não é lido em runtime). Sem isto, o fetch do
# navegador chamaria "/api/..." (raiz do domínio = backend principal!) em
# vez de "/estoque/api/..." (o próprio Controle de Estoque, respeitando o
# basePath).
ENV NEXT_PUBLIC_API_URL="/estoque/api"
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Persistência do estado (data/state.json) — ver src/lib/store.ts. Sem
# banco de dados neste app; o volume Docker (docker-compose.yml) é montado
# aqui e é o que garante que o estoque sobrevive a um rebuild do container.
RUN mkdir -p data
EXPOSE 3000
CMD ["node", "server.js"]
