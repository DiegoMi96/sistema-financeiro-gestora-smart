# Guardião — Next.js 14 (App Router), build standalone.
# Integração ao sistema principal (31/07/2026): container próprio, atrás do
# nginx do sistema principal em /guardiao (ver next.config.js: basePath).

FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL fictícia só para o build: db.ts lança erro se a variável não
# existir, e o Next.js importa esse módulo durante "collect page data" (não
# executa query nenhuma nessa fase). O valor REAL de produção vem do
# docker-compose em runtime, sobrescrevendo este placeholder — nunca é usado
# para conexão de verdade.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgres://build-time-placeholder@localhost/placeholder"
# NEXT_PUBLIC_* precisa existir em BUILD TIME (Next.js embute o valor no
# bundle do cliente — não é lido em runtime). Sem isto, o axios do Guardião
# chamaria "/api/..." (raiz do domínio = backend principal!) em vez de
# "/guardiao/api/..." (o próprio Guardião, respeitando o basePath).
ENV NEXT_PUBLIC_API_URL="/guardiao/api"
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
