# Gestora Smart — Contexto do Projeto

## O que é este sistema

Sistema financeiro web da Gestora Smart, empresa B2B de conectividade que vende SIM cards e soluções M2M/IoT (rastreamento veicular, terminais POS, etc.) com operadoras Vivo, Tim e Claro.

O sistema substitui um processo 100% manual em Excel com 669k+ linhas e ~3.000 boletos mensais.

**Responsável:** Miranda — Controller Financeiro

---

## Arquitetura

```
backend/   → FastAPI (Python 3.12) + PostgreSQL 16
frontend/  → React 18 + Vite + Tailwind CSS
docker-compose.yml → orquestra tudo
```

### Rodar com Docker (padrão)

```bash
docker compose up -d --build
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
# API docs: http://localhost:8000/docs
```

### Rodar localmente (sem Docker)

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (outro terminal)
cd frontend && npm install && npm run dev
```

### Credenciais padrão (desenvolvimento)

```
URL:   http://localhost:3000
Admin: admin@gestorasmart.com.br / Gestora@2024
```

---

## Estado atual do sistema — v1.2 (Junho/2026)

### Módulo 1 — Faturamento ✅ COMPLETO

Tudo abaixo está construído, testado e funcionando com dados reais (Ciclo 13 = Maio/2026, ~692k linhas, 2.547 clientes).

#### Motor de cálculo (`billing_engine.py`)
- Recebe 7 arquivos de entrada: base crua, cancelamentos, fretes, vencimentos, atenção, SMS, mensageria
- Aplica todas as regras de negócio (dias proporcionais, reajuste, excedente, multa, ativação)
- Gera 4 DataFrames: inventário principal, cancelamentos, fretes, mensageria (R$9,90/entrada)
- Processamento em batch de 5.000 linhas
- `CNPJ_EXCLUIDOS = {"22222222222", "24152616000146"}` — excluídos de todo faturamento
- Nomes começando com "ANUIDADE" também são excluídos

#### Regras de status
| Status | Regra |
|---|---|
| Qualquer `Aguardando...` | → trata como **Ativo** (mês cheio) |
| Ativo | dias = total do mês |
| Pré-ativo | dias = 0 (não fatura) |
| Suspenso (antes do mês) | dias = 0 |
| Suspenso (durante o mês) | dias = DAY(data_início_bloqueio) |
| Cancelamento (regra geral) | dias = total do mês |
| Cancelamento (lista atenção) | dias = DAY(data_cancelamento) |
| Ativação (lista atenção) | dias = total_dias - DAY(data_ativacao) + 1 |

#### Fórmulas
```
Mensalidade reajustada = Mensalidade × (1 + reajuste%)
Mensalidade cobrada    = ROUNDUP(mens_reaj / dias_no_mês × dias, 2)
Excedente              = (Crédito_Simcard_KB / 1024) × Preço_MB_Excedente
TOTAL linha            = Mensalidade + Ativação + Excedente + Multa + SMS
```

#### Fluxo do ciclo
`RASCUNHO` → `REVISAO` → `APROVADO` → `FECHADO`

Ao aprovar: banner verde com links para Remessa Asaas (CSV) e Excel.

#### Exportações
- **Remessa Asaas** (`GET /billing/cycles/{id}/export/remessa`): CSV com id_smart, CNPJ, valor, vencimento
- **Excel** (`GET /billing/cycles/{id}/export/excel`): 2 abas — Boletos por cliente + Resumo por Status
  - Gerado em `services/excel_generator.py` — usa summaries (não as 692k linhas, evita timeout)
- **PDF por cliente**: stub criado em `services/pdf_generator.py` — **ainda não implementado**

#### Banco de dados — tabelas do faturamento
- `billing_cycles` — um ciclo por mês/ano
- `billing_lines` — uma linha por SIM card por ciclo (~692k linhas)
  - Índices compostos: `ix_bl_cycle_smart(cycle_id, id_smart)` e `ix_bl_cycle_status(cycle_id, status)`
- `billing_client_summaries` — totais por cliente: mensalidade, ativação, excedente, multa, SMS, frete, mensageria, qtd_linhas_ativas, qtd_cancelamentos, qtd_suspensoes
- `billing_adjustments` — ajustes manuais com trilha de aprovação
  - **BUG CONHECIDO:** `NotNullViolation` no campo `client_id` ao criar ajuste — ainda não corrigido

#### Endpoints principais (`billing.py`)
```
POST /billing/cycles/process          → processa ciclo (upload 7 arquivos)
GET  /billing/cycles                  → lista ciclos
GET  /billing/cycles/{id}             → detalhe do ciclo
POST /billing/cycles/{id}/approve     → aprova ciclo
DELETE /billing/cycles/{id}           → deleta ciclo (RASCUNHO ou REVISAO)
GET  /billing/cycles/{id}/clients     → lista clientes paginada (busca por id_smart)
GET  /billing/cycles/{id}/clients/{id_smart}/summary  → totais do cliente (rápido)
GET  /billing/cycles/{id}/clients/{id_smart}/lines    → linhas paginadas 200/página
GET  /billing/cycles/{id}/breakdown   → resumo por status (SQL agregado)
GET  /billing/cycles/{id}/export/remessa → CSV remessa
GET  /billing/cycles/{id}/export/excel   → Excel (.xlsx)
```

---

### Dashboard ✅ COMPLETO — dois modos por perfil

`DashboardPage.jsx` roteia automaticamente:
- **Admin/Gestor** → `AdminDashboard.jsx` (gerencial)
- **Contas a Receber/Suporte** → `AnalystDashboard.jsx` (operacional)

#### AdminDashboard
- 4 KPI cards: faturamento, boletos, ciclos pendentes, ajustes pendentes
- Gráfico de barras histórico de faturamento
- **Gráfico de linhas: evolução por status** (Ativo/Pré-ativo/Suspenso/Cancelamento/Frete/Mensageria) com toggle Qtd ↔ Valor R$
- Mini cards com totais do último mês por status
- Status dos boletos Asaas (pie chart)
- **Diagnóstico por IA** via Anthropic API com cache em `ai_analyses`

#### AnalystDashboard
- Alertas prioritários (vencidos críticos, vencendo hoje, ajustes pendentes)
- Agenda semanal: boletos vencendo nos próximos 7 dias + projeção diária
- **Registrar pagamento manual** (PIX, boleto, depósito, negociação)
- **Atualizar vencimento** de boleto pelo dashboard

#### Novos endpoints
```
GET  /dashboard/summary               → KPIs + histórico + status boletos
GET  /dashboard/status-evolution      → evolução por status mês a mês
GET  /dashboard/cycles/{id}/breakdown → breakdown agregado por ciclo
GET  /analyst/weekly-agenda           → agenda da semana + projeção diária
GET  /analyst/alerts                  → alertas prioritários
POST /analyst/payments                → registrar pagamento manual
PUT  /analyst/due-date                → alterar vencimento
GET  /analyst/payments/{cycle}/{id_smart} → histórico de pagamentos
GET  /ai/diagnosis/{cycle_id}         → diagnóstico IA (com cache)
```

#### Novos modelos
- `payment_records` — pagamentos manuais fora do Asaas
- `ai_analyses` — cache de diagnósticos por ciclo

---

### Módulo 2 — Contestação 🚧 NÃO INICIADO
- Comparação linha a linha: o que foi cobrado do cliente vs. o que a operadora cobrou da Smart
- Vai consumir `billing_lines` do faturamento

### Módulo 3 — Comissionamento 🚧 NÃO INICIADO
- Calculado por vendedor, por linha individual
- Vinculação cliente-vendedor via `ss_ID` (tabela `cliente_vendedor` a criar)
- Banco já tem todos os dados necessários

---

## O que está pendente (por ordem de prioridade)

### 🔴 Alta prioridade
1. **Bug: ajuste manual** — `NotNullViolation` no campo `client_id` da tabela `billing_adjustments` ao criar ajuste via tela. Campo `client_id` nunca é populado durante o faturamento (identidade é por `id_smart`). Solução: tornar `client_id` nullable no model ou remover FK.
2. **PDF por cliente** — `services/pdf_generator.py` implementado com ReportLab (v1.2). Endpoint `GET /billing/cycles/{id}/clients/{id_smart}/pdf` precisa ser criado no `billing.py`.
3. **ANTHROPIC_API_KEY** — Diagnóstico IA está pronto mas retorna 503 sem a chave. Adicionar ao `.env` quando disponível.

### 🟡 Média prioridade
3. **Validar discrepância Ciclo 11** — diferença residual de ~R$27k entre sistema e Excel manual da Miranda. Investigação parcial feita: causa principal é normalização "Aguardando→Ativo" (regra confirmada correta). Diferença residual não totalmente explicada.
4. **Integração Asaas completa** — hoje só leitura. Implementar criação de cobranças em lote e sincronização automática de status.

### 🟠 Próximos módulos
5. Módulo de Contestação
6. Módulo de Comissionamento
7. Deploy DigitalOcean + domínio + HTTPS

---

## Perfis de acesso

| Perfil | Pode |
|---|---|
| Admin | Tudo |
| Gestor | Ver tudo + aprovar faturamento |
| Contas a Receber | Editar faturamento + criar ajustes |
| Suporte Técnico | Ver contestação apenas |

Permissões individuais no modelo `User` sobrescrevem o perfil padrão.

---

## Integração Asaas

- **Apenas leitura** hoje — consulta boletos existentes, sincroniza status
- Chave da API em `.env` → `ASAAS_API_KEY`
- Cliente identificado por CPF/CNPJ (sem prefixo `ss_`)

---

## Estrutura de arquivos

```
backend/app/
├── main.py                    # entry point FastAPI + seed admin
├── config.py                  # variáveis de ambiente (+ ANTHROPIC_API_KEY)
├── models/
│   ├── __init__.py            # todos os modelos principais + índices compostos
│   └── extra.py               # PaymentRecord + AIAnalysis (v1.2)
├── core/
│   ├── security.py            # JWT, hash de senha
│   └── permissions.py         # permissões por perfil
├── routers/
│   ├── auth.py                # login, usuários
│   ├── billing.py             # faturamento completo
│   ├── dashboard.py           # KPIs, histórico, evolução por status
│   ├── analyst.py             # agenda semanal, alertas, pagamentos manuais, vencimentos
│   └── ai_diagnosis.py        # diagnóstico por IA com cache
└── services/
    ├── billing_engine.py      # motor de cálculo principal
    ├── excel_generator.py     # gerador de Excel com branding verde
    ├── pdf_generator.py       # PDF por cliente (ReportLab) — endpoint pendente no billing.py
    └── asaas_client.py        # integração Asaas (leitura)

frontend/src/
├── App.jsx                    # roteamento principal
├── contexts/
│   ├── AuthContext.jsx        # estado de autenticação global
│   └── ModuleContext.jsx      # módulo ativo + navegação dinâmica
├── pages/
│   ├── WelcomePage.jsx        # seleção de módulo
│   ├── auth/                  # login, usuários
│   ├── billing/
│   │   ├── BillingPage.jsx         # lista de ciclos
│   │   ├── BillingCyclePage.jsx    # detalhe do ciclo + clientes + breakdown
│   │   └── ClientDetailPage.jsx    # detalhe do cliente (totais + linhas paginadas)
│   └── dashboard/
│       ├── DashboardPage.jsx       # roteador: Admin vs Analista por role
│       ├── AdminDashboard.jsx      # visão gerencial: gráficos + diagnóstico IA
│       └── AnalystDashboard.jsx    # visão operacional: agenda + alertas + pagamentos
└── services/api.js            # todas as chamadas à API
```

---

## Notas técnicas importantes

- **Nunca carregar billing_lines via ORM para agregação** — são 692k registros. Sempre usar `db.execute(text("SELECT ... GROUP BY ..."))` direto.
- **Summaries são a fonte de verdade para totais por cliente** — `billing_client_summaries` tem todos os campos breakdown pré-calculados.
- **Paginação obrigatória** em qualquer endpoint que retorne linhas individuais (200/página).
- **React Query v5** (`@tanstack/react-query@^5.40.0`) — sintaxe `queryFn` obrigatória (sem `useQuery([key], fn)`).
- **recharts** já instalado no frontend — usar para todos os gráficos.
