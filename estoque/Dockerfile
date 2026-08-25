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
# Persistência migrada para Postgres em 25/08/2026 (banco próprio
# `estoque_db`, mesmo droplet — ver src/lib/db.ts, schema.ts e
# ESTOQUE_DATABASE_URL no docker-compose.yml). Este diretório e o volume
# Docker correspondente (docker-compose.yml) são o antigo data/state.json —
# mantidos por precaução/rollback, mas nada grava mais aqui.
RUN mkdir -p data
EXPOSE 3000
CMD ["node", "server.js"]
