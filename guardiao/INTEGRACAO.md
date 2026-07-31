# Guardião — Integração ao sistema principal (31/07/2026)

Este é o sistema Guardião desenvolvido pelo Thalles
(https://github.com/Thalles6426/guardiao), trazido para dentro do repositório
principal (gestora-smart) para rodar como parte do mesmo sistema, com login
unificado. Este documento explica **exatamente o que foi trazido igual e o
que foi alterado, e por quê** — para o Thalles (ou qualquer um) entender antes
de mexer de novo.

## O que é

Sistema de controle de consumo de franquias de linhas móveis. Gera
"acionamentos" (alertas) quando uma linha atinge 100% (individual) ou 300%
(compartilhada) da franquia contratada, permite marcar como resolvido, envia
e-mail (Brevo) e SMS (SmsMarket) de notificação, e mantém histórico/auditoria.

**Stack real** (o README original do Thalles descreve uma arquitetura
FastAPI+SQLAlchemy+Alembic que **não é o que foi construído** — está
desatualizado; a versão original ficou em `README-ORIGINAL-THALLES.md`):
Next.js 14 (App Router) full-stack — frontend E as rotas de API estão no
mesmo app Next.js (`src/app/api/**/route.ts`). Banco: **Neon** (Postgres
serverless hospedado externamente, via `@neondatabase/serverless`). Schema em
SQL puro (`src/lib/schema.ts`), sem ORM/migrations de verdade.

## O que foi trazido 100% igual (zero mudança de lógica de negócio)

Todo o restante do código: páginas, componentes, queries SQL, regras de
threshold, geração de alertas, upload de planilha, exportações, envio de
e-mail/SMS, etc. **Nada disso foi tocado.** Os arquivos originais do Thalles
para os poucos arquivos que MUDARAM estão preservados em `ORIGINAIS-THALLES/`
para comparação.

## O que foi alterado — e por quê

### 1. Login unificado (pedido explícito do Diego)

O Guardião tinha login próprio (e-mail/senha, JWT com `jose`, tabela `users`
própria no Neon). Isso foi substituído por uma ponte de autenticação com o
sistema principal:

- **`src/lib/mainAuth.ts`** (novo arquivo) — verifica o MESMO token JWT
  emitido pelo backend principal (`backend/app/core/security.py`), usando a
  variável `GESTORA_JWT_SECRET` — que **precisa ser idêntica** à `SECRET_KEY`
  do backend (mesmo algoritmo HS256). No docker-compose, isso é garantido
  referenciando a MESMA variável `${SECRET_KEY}` — nunca duplicar o valor à
  mão.
- **`src/lib/roleMap.ts`** (novo arquivo) — mapeia o papel do usuário no
  sistema principal (admin, gestor, contas_receber, suporte_tecnico, etc.)
  para o papel que o Guardião entende (admin | analyst | viewer). Hoje:
  admin/gestor → admin; contas_receber → analyst; qualquer outro → viewer.
  **Isso é uma decisão temporária/ajustável** — falar com Diego/Thalles se
  quiserem regras mais finas por usuário.
- **`src/hooks/useAuth.ts`** (reescrito) — em vez de chamar
  `/api/auth/login` e `/api/auth/me` próprios, lê diretamente
  `localStorage.getItem('token')` e `localStorage.getItem('user')` (as MESMAS
  chaves que o app principal grava) — funciona porque o Guardião roda na
  MESMA origem do sistema principal (`sistema.gestorasmart.com.br/guardiao`).
  Sem sessão do sistema principal, trata como não-autenticado.
- **`src/app/login/page.tsx`** (reescrito) — não mostra mais formulário
  próprio; redireciona para `/` (a raiz do sistema principal, que cuida do
  login de verdade).
- **`src/app/dashboard/layout.tsx`** e **`src/components/layout/Navbar.tsx`**
  (pequeno ajuste) — o redirect de "não autenticado" / logout aponta para `/`
  (sistema principal) em vez do `/login` próprio do Guardião (que não existe
  mais como tela).
- **Todas as ~26 rotas de API que estavam SEM NENHUMA autenticação** (alerts,
  clients, dashboard, snapshots, uploads, analytics, validation-rules,
  audit-log, etc.) agora exigem `requireMainAuth()`. As 3 rotas administrativas
  perigosas (`/api/admin/clear-db`, `/api/admin/seed-admin`,
  `/api/admin/setup-db`) exigem, além disso, papel mapeado como "admin".
  **Isso não existia antes** — o app original tinha só 3 de 32 rotas
  protegidas (`auth/me`, `users`, `users/[id]`), e essas 3 usavam o JWT
  próprio do Guardião (trocado para usar `requireMainAuth` também).

### 2. Infraestrutura (não é lógica de negócio — necessário para rodar aqui)

- **`next.config.js`**: adicionado `basePath: "/guardiao"` (roda em subpath
  do domínio principal, não em domínio/porta próprios) e
  `output: "standalone"` (imagem Docker enxuta).
- **`Dockerfile`** (novo) — build multi-stage Next.js standalone.
- **`docker-compose.yml`** do repo principal — novo serviço `guardiao`,
  porta 3002 (3000 já está em uso pelo dashboard legado
  `/var/www/gestora-smart/server.js`; 4000 é o frontend principal).
- **nginx** (`sistema-gestora`, no servidor) — novo `location /guardiao/`
  proxeando para `127.0.0.1:3002`, sem barra final no `proxy_pass` (preserva
  o prefixo `/guardiao` que o Next.js espera por causa do `basePath`).

## Pendências (o que falta para funcionar de verdade)

- 🔴 **`DATABASE_URL` real do Neon** — só o Thalles tem. Sem isso, o
  container sobe e a autenticação funciona, mas nenhuma tela com dados
  funciona (erros de conexão). Env var: `GUARDIAO_DATABASE_URL` no `.env` do
  servidor.
- 🟡 Opcionais (funcionam sem, só aquela funcionalidade específica falha
  graciosamente): `GUARDIAO_CRON_SECRET` (limpeza mensal automática),
  `GUARDIAO_BREVO_API_KEY` (e-mail de alerta), `GUARDIAO_SMSMARKET_USER` /
  `GUARDIAO_SMSMARKET_PASSWORD` (SMS de alerta).
- 🟡 A página "Usuários" do Guardião (`/dashboard/users`, gerencia a tabela
  `users` própria do Neon) ficou **vestigial** — como o login é unificado,
  essa tabela não controla mais quem acessa. Mantida funcionando (não removi),
  mas não tem mais efeito real de acesso. Decidir depois se remove, esconde
  ou repropõe para outra coisa.
- 🟡 O checque "você não pode deletar seu próprio usuário" em
  `api/users/[id]/route.ts` (DELETE) compara IDs de sistemas diferentes
  (nosso `sub` numérico vs. o `id` do Neon) — nunca vai bater. Efeito: essa
  trava específica não funciona mais (risco baixo, página já é vestigial).

## Fase 2 (ainda não feita)

Depois que o time testar e aprovar: liberar para o Thalles mexer no Guardião
pela própria máquina dele (aceitar as mudanças de auth desta integração, e a
partir daí ele mantém o resto). Ainda não decidido como (acesso direto ao
servidor? PR pelo GitHub? Precisa alinhar com o Diego.
