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
```

#### Novos modelos
- `payment_records` — pagamentos manuais fora do Asaas
- `ai_analyses` — (tabela antiga do Diagnóstico IA, REMOVIDO em 07/10/2026; os dados ficam guardados, nenhum código usa)

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
3. ~~Diagnóstico IA~~ — **removido em 07/10/2026** (pedido do Diego: deixava o sistema mais pesado, sem ganho na operação). Tela, rota, menu, endpoints `/ai/*` e o campo da chave em Configurações saíram; as tabelas `ai_analyses`/`operational_diagnoses` e a permissão `can_view_fat_diagnostico_ia` ficam dormentes no banco.

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
├── config.py                  # variáveis de ambiente (ANTHROPIC_API_KEY ficou no código só por compatibilidade com o .env; ninguém usa)
├── models/
│   ├── __init__.py            # todos os modelos principais + índices compostos
│   └── extra.py               # PaymentRecord + AIAnalysis (dormente) (v1.2)
├── core/
│   ├── security.py            # JWT, hash de senha
│   └── permissions.py         # permissões por perfil
├── routers/
│   ├── auth.py                # login, usuários
│   ├── billing.py             # faturamento completo
│   ├── dashboard.py           # KPIs, histórico, evolução por status
│   ├── analyst.py             # agenda semanal, alertas, pagamentos manuais, vencimentos
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

## Faturamento — Aba "Atenção" (09/10/2026)
- Tabela `client_attention` (model `ClientAttention`, única por id_smart+motivo). CRUD em `routers/attention.py` (`/attention`), tela `pages/billing/AttentionPage.jsx`, permissão `can_edit_billing`.
- Motivos: `ativacao` / `cancelamento` (proporcional sim/não) e `desconto` (percentual ou valor fixo).
- Motor (`_run_billing_engine`): `load_attention_rules` alimenta `atencao_cancel`/`atencao_ativ` (somados ao proporcional vindo das planilhas) e `aplicar_descontos` cria `BillingAdjustment` automáticos (analista "Sistema (aba Atenção)") com o motivo na justificativa; o remessa Asaas escreve o motivo na coluna Descrição.
- O upload "Atenção Clientes" foi removido do modal Novo Faturamento. Antes do 1º ciclo real, importar a planilha antiga pelo botão "Importar planilha" da aba.
- Reprocessar ciclo RASCUNHO/ERRO apaga os ajustes antigos do ciclo (evita duplicar descontos).

## Faturamento — Aba "Comissionamento" dos analistas (09/10/2026)
- Comissão de contas a receber por adimplência, por vencimento ORIGINAL (10/15/20/25). Router `analyst_commission.py` (`/analyst-commission`), tabela `analyst_commission_config` (mês+dia → percentual e meta R$; mês sem config herda o anterior), tela `AnalystCommissionPage.jsx`, permissão `can_edit_billing`.
- Vencimento original = dia de `billing_client_summaries.due_date` do ciclo; recebido/faturado vêm de `asaas_payments_sync` cruzado por CNPJ (o `boleto_status` do resumo NÃO é preenchido). Valor = percentual × recebido, liberado só se recebido >= meta (meta 0 = sem meta).
- Pendente (evolução): percentuais por analista (ainda não há carteira de clientes por analista no sistema).
- (10/10/2026) Aba Comissionamento dos analistas: o **recebido** conta só boleto pago NO DIA do vencimento ou no dia seguinte (10/11, 15/16, 20/21, 25/26), por `payment_date` (Asaas) / `data_pagamento` (Itaú) — pago antes (antecipado) ou depois não conta; é a base da meta. Meta 0 = não definida, não libera. Salário base fica num bloco separado.
- (12/10/2026) Aba Atenção: o **Motivo** virou caixinhas (um cliente pode ter vários; 1 linha em `client_attention` por motivo, gravadas juntas por `POST /attention/lote`, com `substituir` na edição = desmarcado remove a regra). Novo motivo **`sem_arredondamento`** ("Não arredondar reajuste"): o motor (`_run_billing_engine`) soma esses clientes a `cnpj_sem_arredondamento` (a mesma exceção de Configurações), então a mensalidade reajustada usa `round(2)` em vez de `_roundup2` (ex.: 10 × 1,0333 = 10,33 em vez de 10,34).
- (12/10/2026) Detalhamento do cliente (Excel): em linha **Suspenso** com "Data de início da suspensão" vazia, a coluna V mostra a "Data de início do bloqueio de rede" (já preenchida = mantém). Aplicado em `excel_generator._row_from_line` (vale para ciclos antigos e novos) e gravado em `BillingLine.data_inicio_suspensao` nos ciclos novos (`_inv_line` em billing.py). Só a data exibida/gravada — o cálculo dos dias já usava esse fallback desde 05/08/2026 (`db_susp.fillna(db_bloq)` em `_calcular`), nenhum valor cobrado muda. Outros status (Ativo, Cancelamento…) não são afetados.
- (19/10/2026) **Período informativo do ciclo** (mudança do ciclo de faturamento para 20→19; transição 01/10→20/10): no "Novo faturamento" há **Data início** e **Data término** (padrão = 1º ao último dia do mês; deixam de acompanhar o mês depois que o usuário edita). Gravadas em `billing_cycles.data_inicio/data_fim` (nulas = mês-calendário) e exibidas no cabeçalho do ciclo e em **duas colunas novas no fim** das planilhas de detalhamento/Excel do ciclo (AH "Data início", AI "Data término"; as 33 colunas de antes não mudaram — `excel_generator.periodo_do_ciclo`). **NÃO entram no cálculo**: o motor continua usando `year`/`month` (dias do mês, proporcional por DAY-do-mês etc.). Atenção: com janela 20→19, proporcionais de ativação/cancelamento/suspensão seguem contados pelo dia do mês-calendário — se isso precisar acompanhar a janela, é uma mudança de motor à parte.

## Faturamento — Clube Smart no motor (19/10/2026)
Regras combinadas com o Diego (código em `backend/app/services/clube.py`; integração em `_run_billing_engine`, `routers/billing.py`):
- **Frete:** planilha de frete ganha a coluna **Categoria** (`Hardware`/`Software`, sem diferenciar maiúsculas). Só `Software` (SIM card) recebe **20% de desconto, limitado a R$ 100 por frete**, em linha própria (status "Desconto Frete Clube Smart", total negativo, OBS no "Nome do pedido" com o nº do pedido). Sem categoria = sem desconto. O `total_frete` do cliente continua bruto; o desconto vai em `total_desc_clube` e abate do `total_final`. NÃO vincula o pedido à base.
- **Parcelamento (excedente e multa de cancelamento):** automático em 3x para todos, quando o total do cliente por tipo é **>= R$ 10**. Parcela 1 no ciclo da dívida; 2 e 3 nos ciclos seguintes (tabela `billing_installments`, uma linha por parcela). Linhas de origem seguem mostrando o valor apurado (colunas Excedente/Multa), mas **não entram no Total**; o que cobra é a linha de parcela (status "Parcela Excedente"/"Parcela Multa", info no **Nome do pedido**: `Parcela 1/3 – Multa total R$ 120,00 – 8 linhas – Cancelamento set/26` e `Parcela 1/3 – Excedente total R$ 90,00 – MB total 12.340 – Consumo set/26`). O parcelamento incide só sobre excedente e multa, nunca sobre mensalidade.
- **Cancelamento total** (cliente sem nenhuma linha que não seja Cancelamento no inventário): não parcela dívida nova e cobra o saldo pendente inteiro (parcelas restantes viram "antecipada").
- **Sair do Clube:** motivo **"Sem Clube Smart"** na aba Atenção → sem desconto de frete, sem novos parcelamentos, sem linha do Clube. Parcelas já criadas continuam normalmente.
- **Linha "Clube Smart":** uma por cliente com linha viva; status "Clube Smart", valor na coluna Mensalidade (base e calculada). **R$ 0,00 até o ciclo anterior à 1ª cobrança; R$ 9,90 a partir do ciclo de fevereiro/2027** (fatura de fevereiro, boleto vence em março). Config em `system_settings`: `clube_primeira_cobranca` (AAAA-MM, padrão 2027-02), `clube_valor`, `clube_frete_pct`, `clube_frete_limite`, `clube_parcelas`, `clube_parcela_minimo`.
- **Reprocessar/excluir ciclo:** `liberar_ciclo` devolve as parcelas cobradas ali a "pendente" e apaga os planos nascidos ali; **bloqueia** (erro explícito) se parcelas desses planos já foram cobradas num ciclo posterior — exclua/reprocesse o posterior primeiro.
- Prazo de ativação estendido, 20% de SMS massivo (Simples Envio) e SIM com valor exclusivo são tratados pelo comercial/plataformas — **não passam pelo motor**.
- PDF (aprovado 19/10): layout atual com 2 mudanças: **Competência ao lado de Dados do Cliente** e **Outros Serviços com coluna Categoria** (`Padrão` | `Clube Smart`). Linhas Clube Smart (destacadas em verde, categoria em negrito) usam como nome do item **o mesmo texto do "Nome do pedido" do detalhamento** (uma linha por item: um desconto por frete, uma por parcela, ex. `Parcela 1/3 – Multa total R$ 120,00 – 8 linhas – Cancelamento out/26`) e `Clube Smart – mensalidade` a partir de fev/2027 (só a partir de fev/2027, com valor). O que está em parcela sai das linhas Excedente/Cancelamento (não conta em dobro). Cliente sem benefício = só linhas Padrão.
- Excel de detalhamento: colunas Data início/Data término agora logo depois de "Nome do pedido" (só ordem de saída).
