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
- **Frete:** planilha de frete ganha a coluna **Categoria** (valores aceitos para desconto: `simcard`, `sim card` ou `software`, sem diferenciar maiúsculas/espaços; `hardware`/vazio = sem desconto). A coluna é lida na aba "Resumo" (formato do frete de outubro/2026: REMETENTE, DESCRIÇÃO, DESTINATARIO, CNPJ, ID_CNPJCPF, PEDIDO, VALOR TOTAL, Categoria). Só SIM card recebe **20% de desconto, limitado a R$ 100 por frete**, em linha própria (status "Desconto Frete Clube Smart", total negativo, OBS no "Nome do pedido" com o nº do pedido). Sem categoria = sem desconto. O `total_frete` do cliente continua bruto; o desconto vai em `total_desc_clube` e abate do `total_final`. NÃO vincula o pedido à base.
- **Parcelamento (excedente e multa de cancelamento):** automático em 3x para todos, quando o total do cliente por tipo é **>= R$ 10**. Parcela 1 no ciclo da dívida; 2 e 3 nos ciclos seguintes (tabela `billing_installments`, uma linha por parcela). Linhas de origem seguem mostrando o valor apurado (colunas Excedente/Multa), mas **não entram no Total**; o que cobra é a linha de parcela (status "Parcela Excedente"/"Parcela Multa", info no **Nome do pedido**: `Parcela 1/3 – Multa total R$ 120,00 – 8 linhas – Cancelamento set/26` e `Parcela 1/3 – MB total 12.340 – Consumo set/26 – Total R$ 90,00`). O parcelamento incide só sobre excedente e multa, nunca sobre mensalidade.
- **Cancelamento total** (cliente sem nenhuma linha que não seja Cancelamento no inventário): não parcela dívida nova e cobra o saldo pendente inteiro (parcelas restantes viram "antecipada").
- **Sair do Clube:** motivo **"Sem Clube Smart"** na aba Atenção → sem desconto de frete, sem novos parcelamentos, sem linha do Clube. Parcelas já criadas continuam normalmente.
- **Linha "Clube Smart":** uma por cliente com linha viva; status "Clube Smart", valor na coluna Mensalidade (base e calculada). **R$ 0,00 até o ciclo anterior à 1ª cobrança; R$ 9,90 a partir do ciclo de fevereiro/2027** (fatura de fevereiro, boleto vence em março). Config em `system_settings`: `clube_primeira_cobranca` (AAAA-MM, padrão 2027-02), `clube_valor`, `clube_frete_pct`, `clube_frete_limite`, `clube_parcelas`, `clube_parcela_minimo`.
- **Reprocessar/excluir ciclo:** `liberar_ciclo` devolve as parcelas cobradas ali a "pendente" e apaga os planos nascidos ali; **bloqueia** (erro explícito) se parcelas desses planos já foram cobradas num ciclo posterior — exclua/reprocesse o posterior primeiro.
- Prazo de ativação estendido, 20% de SMS massivo (Simples Envio) e SIM com valor exclusivo são tratados pelo comercial/plataformas — **não passam pelo motor**.
- PDF (aprovado 19/10): layout atual (Competência na barra abaixo de Dados do Cliente, como sempre foi) com **Outros Serviços com coluna Categoria** (`Padrão` | `Clube Smart`). Em Outros Serviços o **Item não é negrito**; negrito só no Subtotal (a categoria "Clube Smart" também não é negrito). Linhas Clube Smart (linha inteira em verde claro, o mesmo verde da coluna Subtotal — um verde só, sem sobrepor tons) usam como item o texto do "Nome do pedido" do detalhamento, **sem o `– Total R$ ...` da parcela de excedente** (o valor vai em Valor/Subtotal): `Parcela 1/3 – MB total 250 – Consumo out/26`, `Parcela 1/3 – 8 linhas – Cancelamento out/26` (sem o "Multa total R$ ...", que fica só no Excel), e o desconto de frete em **uma linha só** (soma, qtd = nº de fretes): `Desconto Frete 20%` — sem o nº do pedido no PDF (o Excel mantém o pedido no Nome do pedido). No Excel o texto completo continua no Nome do pedido e a linha **`Clube Smart`** (mensalidade: R$ 0,00 até jan/2027, R$ 9,90 a partir de fev/2027) logo abaixo do Pacote Mensageria, primeira das linhas do Clube; só aparece para quem tem a linha do Clube (só a partir de fev/2027, com valor). O que está em parcela sai das linhas Excedente/Cancelamento (não conta em dobro). Cliente sem benefício = só linhas Padrão.
- Excel de detalhamento: colunas Data início/Data término agora logo depois de "Nome do pedido" (só ordem de saída).
- PDF: a tabela **SIMCARDs Ativos mostra só as operadoras em que o cliente tem linha** (qtd, valor ou ativação > 0); cliente sem nenhuma linha ativa mostra uma linha zerada ("—"). Testar sempre os dois lados (com e sem benefício; ciclo antigo) antes de publicar mudança de PDF.
- Dashboard do analista, "Lista de vencidos do mês" (`frontend/src/pages/dashboard/AnalystDashboard.jsx`): botão **Filtro** (banco Asaas/Itaú, período de **vencimento** de/até sobre o 1º vencimento — limites inclusivos —, valor mínimo; badge com nº de filtros, contador "x de y", "Limpar filtros"); filtra no navegador, junto com a busca, e o "Exportar" CSV respeita o filtro. Descrição dos boletos do Itaú = `[ Competência MÊS ]` (mês anterior ao vencimento; `_descricao_itau` em `routers/analyst.py`); Asaas usa a descrição exata da API.
- Dashboard do analista, cards de KPI (`KPICard`): o **valor nunca quebra de linha** (`whitespace-nowrap`); fica em 18px e só encolhe (mín. 11px) quando não cabe no card. A linha de 5 cards só vale a partir de 1280px (`xl:grid-cols-5`); abaixo disso são 3 colunas. Testado com R$ 2.882.598,56 em 1100/1280/1600px.
- **Aba Clientes removida do menu (21/10/2026)** a pedido do Diego (pouco usada; o botão de remessa do Asaas também não é usado). `/clientes` redireciona para `/dashboard`. NADA foi apagado do backend: tabela `client_profiles` e rotas `/clients/*` seguem, porque nomes nas telas de faturamento e a busca da Atenção usam o cadastro. A página continua em `frontend/src/pages/clients/ClientsPage.jsx` (basta recolocar o item no `ModuleContext` e a rota no `App.jsx` para restaurar). Atenção: o campo Banco do cadastro só importa se alguém voltar a usar a remessa do Asaas (ela exclui só quem está marcado como Itaú).

## Faturamento — aba "Importação" do ciclo (21/10/2026)
Fica ao lado de Ajustes na tela do ciclo (permissão `can_approve_billing`) e substitui o botão "Remessa Asaas" que ficava no topo (o modal antigo de remessa gerada pelo sistema continua acessível por um link discreto dentro da aba).
- Fluxo: sobe a planilha no **modelo de importação do Asaas** (`Importacao_Cobrancas_ASAAS_v4_ID+CPF-CNPJ.xlsx`: cabeçalho na linha que começa com "Identificador único do CLIENTE…", dados abaixo) → `POST /billing/cycles/{id}/import/validate` valida linha a linha → o usuário marca/desmarca → botão **Remessa Asaas** (`POST /billing/cycles/{id}/import/remessa`) devolve a **mesma planilha** sem as linhas desmarcadas (formato preservado).
- **Etapa 1 (no ar): nada é enviado ao Asaas.** Etapa 2 (futura, só com sandbox testado e confirmação do Diego): lançar as cobranças pela API do Asaas (hoje `AsaasClient` só lê; não existe criação de cobrança), com `externalReference` único por cliente+ciclo contra duplicidade, lotes, log e reenvio dos que falharam.
- Regras: **erro** (não vai na remessa, checkbox travado): sem identificador, cliente fora do ciclo, vencimento ausente/passado, valor ausente/zero, cliente repetido. **Atenção**: valor diferente do ciclo (>R$ 0,01), já tem boleto do Itaú no mês (nasce desmarcado), já existe cobrança no Asaas no mês (nasce desmarcado), cliente não cadastrado no Asaas. Também mostra totais (planilha × ciclo) e os clientes do ciclo que ficaram fora da planilha.
- **Etapa 2 (21/10/2026): "Criar cobranças no Asaas" pela API.** Botão **Remessa Asaas** da aba Importação abre o modal "Exportar Remessa Asaas" (descrição pré-preenchida com a competência, forma de pagamento, % juros, multa e tipo da multa — valem para as linhas marcadas e substituem os da planilha) com três ações: **Gerar planilha** (download), **Simular** (confere clientes e duplicidade, não cria nada) e **Criar cobranças no Asaas**.
  - **Ambiente separado da chave de produção** (`services/asaas_client.py::get_asaas_creation_client`): padrão **sandbox**, com chave própria `asaas_sandbox_api_key` (Configurações → Integrações → Asaas) e URL `https://api-sandbox.asaas.com/v3`. Só vai para **produção** se `asaas_criar_modo = producao` em Configurações; aí exige: usuário admin, ciclo APROVADO/FECHADO e digitar `CRIAR COBRANÇAS EM PRODUÇÃO`. A chave de produção NUNCA é usada em modo sandbox. Sem chave do sandbox, o botão avisa e não faz nada.
  - Idempotência: `externalReference = "<id_smart>|<AAAA-MM>"`; antes de criar, procura item já criado em outra execução e cobrança existente no Asaas com a referência. Repetir a planilha não duplica.
  - Cliente: produção só usa quem já está cadastrado no Asaas (não cria cliente); sandbox cria o cliente (sem notificações) se não existir, só para permitir o teste.
  - Execução em segundo plano com progresso no banco (`asaas_remessa_jobs` / `asaas_remessa_itens`, o backend tem 2 workers): ~4 cobranças/s, repete sozinho no limite de ritmo (429), uma execução por ciclo, botões **Tentar novamente os que falharam**, **Cancelar** e **Baixar erros (CSV)**. Execução parada >15 min é considerada interrompida e pode ser retomada.
  - Payload (documentação Asaas): `customer`, `billingType=BOLETO`, `value`, `dueDate`, `description` (≤500), `externalReference`, `interest.value`, `fine.value` + `fine.type` (`PERCENTAGE`/`FIXED`). Só Boleto é suportado na criação.
  - **Validação (21/10/2026):** primeiro contra um Asaas SIMULADO (erro de validação e 429) e depois no **sandbox REAL** (conta nova do Diego, chave `$aact_hmlg_` salva em Configurações): conexão 200; **Simular** sem criar nada; **criar 5 cobranças** da planilha real (BOLETO, valor/vencimento/descrição corretos, `interest 1% PERCENTAGE`, `fine 2% PERCENTAGE`, `externalReference` `<id>|2026-10`, clientes criados com `notificationDisabled`); repetir a planilha = 5 existentes, 0 duplicadas; conferido também no painel sandbox.asaas.com. Ainda **não testado em escala** (a lista cheia leva ~35–40 min em produção, ~90 min no sandbox com criação de clientes) nem em produção.

## Comissionamento dos analistas — margem de 5% no time (22/10/2026)
Pedido do Diego: a meta (R$) de cada vencimento (10/15/20/25) passa a contar como **atingida a partir de 95%** dela ("em vez de 100%, considerar 95%"). Só o gatilho muda: o percentual sobre o salário e a Previsão continuam iguais. Código: `routers/analyst_commission.py` (`meta_atingida`, `_margem_meta`; campos novos `margem_meta_pct` e `meta_minima` na resposta) e `AnalystCommissionPage.jsx` (Realizado, cor do Alcance e selo "Atingida" usam a mesma margem; rótulo "Meta atingida (a partir de 95%)"). Margem configurável sem deploy em `system_settings.analistas_margem_meta_pct` (padrão 5; 0 = comportamento antigo). Testado: 96% e exatamente 95% = atingida; 94,9% = não; 100% = atingida; margem 0 e margem 10 conferidas. Vale para todos os analistas (Brenda, Carlo…) e meses abertos; o cálculo é feito na hora (não há extrato gravado por mês nessa aba).
- **Comissionamento dos analistas — "Recebido no dia" desatualizado (22/10/2026):** a tela guardava os dados por 5 min (staleTime global do react-query em `App.jsx`) e o upload do Itaú no Painel só invalidava `analyst-operational`, então quem importava o Itaú e abria o Comissionamento via o recebido antigo. Corrigido: a consulta `['analyst-commission', …]` usa `staleTime: 0` + `refetchOnMount: 'always'` e o upload do Itaú também invalida `analyst-commission`. Testado (R$ 197,05 → R$ 247,38 ao voltar à aba depois de entrar um pagamento do Itaú).
- **Vencimento em fim de semana (22/10/2026, decidido e aplicado):** sábado e domingo NÃO são dia útil, mas o Pix pago no fim de semana conta. Janela do "Recebido no dia" = do **vencimento real até 1 dia depois do primeiro dia útil** (`analyst_commission.py`, via `effective_due_date_sql`). Venc. sábado 10 → vale pago de sáb 10 a ter 13; domingo 25 → dom 25 a ter 27; dia útil comum → vencimento e dia seguinte, como sempre. Feriados não entram (sem calendário). Efeito esperado em 10/2026 (Asaas+Itaú): dia 10 de ≈R$ 12,4 mil para ≈R$ 104,3 mil; dias 15 e 20 não mudam por esta regra. Ponto aberto: sexta-feira também só soma até sábado (pagamento de segunda não entra) — não foi pedido mudar.
- **Recebido no dia — cada boleto vale no dia do SEU vencimento (22/10/2026, conferido contra as planilhas do Diego `15102026.xlsx` e `20102026.xlsx`):** o cálculo antigo atribuía o pagamento ao dia que o CLIENTE tinha no ciclo (`billing_client_summaries.due_date`). Isso errava por dois motivos: (1) no ciclo de setembro **500 clientes (R$ 731 mil) estão sem `due_date`** (não vieram no arquivo de Vencimentos) e todos os seus pagamentos do Asaas ficavam de fora (≈R$ 106 mil entre dias 15 e 20); (2) clientes com ciclo no dia 10 mas boleto vencendo dia 15/20 (ex.: Escudo Clube) caíam na coluna errada. Agora (`analyst_commission.py`): universo = boletos Asaas+Itaú com vencimento no mês; **dia do boleto = dia do próprio vencimento (10/15/20/25); vencimento deslocado 1 dia (16) vale no dia anterior (15)**; base = clientes do ciclo (Asaas e Itaú) + boletos do Itaú de clientes fora do ciclo; cliente do ciclo com vencimento mas sem boleto entra só no faturado (valor do ciclo); janela de "pago no dia" = do vencimento do grupo até 1 dia depois do 1º dia útil (sáb/dom não são dia útil). Cliente do Asaas fora do ciclo continua não entrando (ex.: Ricardo Barbosa, R$ 43,50, que aparece na planilha do Diego). Testado no ambiente isolado (11 cenários) e comparado com as planilhas.
- **Pendência de dados (não é do código):** conferir por que 500 clientes do ciclo de setembro ficaram sem vencimento (arquivo `10 - VENCIMENTOS.xlsx` de setembro) e garantir que o de outubro (`11 - VENCIMENTOS.xlsx`) traga todos.
- **Vencimento ORIGINAL do Asaas, só para o Comissionamento dos analistas (22/10/2026, pedido do Diego):** nova coluna `asaas_payments_sync.original_due_date` (`originalDueDate` da API do Asaas), gravada na sincronização (`asaas_sync.py::_upsert_payments`; reenvio sem o campo não apaga o já gravado). `analyst_commission.py` usa `COALESCE(original_due_date, due_date)` para boletos do Asaas (agrupa, define a janela e o filtro do mês por ele); Itaú só tem o vencimento atual. Nenhuma outra tela usa a coluna. A sincronização cobre mês atual + anterior (`MONTHS_BACK=2`), então boletos antigos só ganham a data original se estiverem nesses meses. Também: o Comissionamento calcula mesmo que nenhum cliente do ciclo tenha vencimento (antes mostrava vazio se houvesse boletos nos bancos).

## Faturamento — Régua de cobrança (aba "Cobrança", 24/10/2026)
E-mail + WhatsApp (Umbler) para boletos em aberto (Asaas + Itaú). Código: `backend/app/services/cobranca.py` (núcleo), `services/umbler.py`, `services/devolucoes.py`, `routers/cobranca.py`; tabelas `cobranca_etapas`, `cobranca_envios` (fila + histórico), `cobranca_pausas`, `cobranca_whatsapp_consent`, `cobranca_emails_invalidos`, `cobranca_devolucoes_lidas`; telas em `frontend/src/pages/cobranca/` (Fila, Régua, WhatsApp, E-mails devolvidos, Pausas, Configuração). Permissões: `can_edit_billing` (analista: fila, aprovar, pausar) e `can_approve_billing` (gestor/admin: etapas, chaves, e-mail, Umbler). Publicada com TUDO DESLIGADO.
- **Gerar × enviar são separados.** Gerar a fila só cria linhas (`/cobranca/gerar`; a geração automática diária às 07:00 nasce DESLIGADA — `regua_geracao_automatica`). Nada sai sem aprovação do analista, sem a chave geral `regua_envio_ativo = 1` e, para WhatsApp, sem `whatsapp_ativo = 1`. **Modo teste** (`regua_modo_teste`, padrão ligado): e-mails vão para `regua_email_teste` e WhatsApp para `whatsapp_telefone_teste`; respostas de WhatsApp em modo teste NÃO alteram autorizações e devoluções de envios de teste NÃO invalidam endereços de clientes.
- **Remetente/teste de e-mail hoje: `financeiro@gestorasmart.com.br`** (o Diego vai trocar depois para `contasareceber@gestorasmart.com.br` em Configuração; padrões em `_DEFAULTS_CFG`). SMTP, IMAP e token da Umbler são digitados pelo Diego na tela (nunca pedir/ver); ficam em `system_settings`, mascarados na API.
- **Janela de envio:** dias úteis, 09:00–18:00 (`regua_horario_inicio/fim`), sem sábado, domingo e feriados (nacionais + Carnaval seg/ter + Sexta Santa + Corpus Christi, calculados; extras municipais/estaduais em `regua_feriados_extra`). Vale para e-mail e WhatsApp; não existe opção de enviar em fim de semana. Aprovado fora da janela espera a próxima.
- **Etapas** (padrão, prazos editáveis): lembrete −5, vence hoje 0, atraso +3, bloqueio +7, tarefa +10 (só lista interna, desligada). Cada boleto recebe só a etapa de e-mail MAIS AVANÇADA que já vale (janela de tolerância de 3 dias). `boleto_ref` inclui o vencimento (mudou o vencimento → etapas voltam a valer). Idempotência: unique (etapa, boleto_ref, canal).
- **Antes de enviar** reconfere se o boleto segue em aberto com o mesmo vencimento, se o cliente não foi pausado e se os dados de pagamento estão frescos (Asaas ≤ 12 h, planilha do Itaú ≤ 3 dias — senão aquela origem não gera nem envia). Limite diário de e-mails (`regua_limite_diario`).
- **WhatsApp:** e-mail é sempre obrigatório; WhatsApp é adicional e só para quem autorizou. Antes da 1ª mensagem vai UM pedido de autorização (etapa `consentimento`, template com botões Sim/Não); resposta lida por consulta periódica (sim → `aceitou`; não/sair → `recusou`; outra → `respondeu_outro`, o analista decide na aba WhatsApp). Só template aprovado (ID por etapa + ordem dos campos). Limites: `whatsapp_limite_5min` (100, máx. 100), `whatsapp_limite_diario` (começa em 30), 1 WhatsApp por cliente por dia, um sender por vez (advisory lock em conexão dedicada). **Disjuntor:** 3 falhas seguidas, ≥30% de falha de entrega nas últimas 20, ou canal restrito/desativado (`checar_canal`) → pausa o canal sozinho (`whatsapp_pausado_motivo`); só admin religa. Estados de entrega (Enviada → Entregue → Lida / Falhou) por `GET /v1/messages/{id}/states/`, a cada ~5 min. WhatsApp nunca é aprovado automaticamente. O número do canal é o OFICIAL do financeiro da Smart — não pode ser perdido.
- **E-mails devolvidos:** leitura IMAP SOMENTE LEITURA (`INBOX` readonly, `BODY.PEEK`) da caixa do remetente; reconhece devolução padrão (RFC 3464) e texto livre, acha o envio pelo Message-ID, marca `devolvido` e registra o endereço em `cobranca_emails_invalidos` (falha permanente 5.x; 4.x/“delayed” é ignorada); a régua não gera nem envia para endereço inválido até um analista liberar (aba “E-mails devolvidos”). Precisa de IMAP configurado (usa usuário/senha do envio se em branco).
- Rotina em background (`regua_loop`, a cada 5 min, nos 2 workers; tudo idempotente): gera fila (se automática), confere canal, estados e respostas, lê devoluções (a cada 15 min), aprova etapas automáticas de e-mail (se houver) e envia o que está aprovado dentro da janela.
- Descartados/adiados nesta fase: conferência automática do ciclo, painel “Ciclo mais recente” e avisos do ciclo (código dos dois últimos em `~/projetos/_guardado_avisos_ciclo`). Pendente: ponto 4 (visualização de clientes por vencimento), webhook da Umbler (hoje consulta periódica) e a aba Clientes foi RESTAURADA (fonte dos e-mails/telefones da régua).
- **Revisão independente (24/10/2026, antes de publicar) e correções:** (1) devoluções só valem com o Message-ID ORIGINAL exato (e o endereço citado tem de ser um dos do envio) — devolução forjada/curinga é ignorada; só falha **5.1.x** invalida o endereço (5.2.2 caixa cheia, 5.7.x política não); IMAP valida certificado. (2) Trocar servidor/usuário do SMTP (ou IMAP de outro provedor) **exige digitar a senha de novo**; hosts com IP interno são recusados; portas restritas (SMTP 587/465/25/2525, IMAP 993); SMTP sem criptografia não é aceito; o endereço da Umbler é **fixo** (`umbler.BASE_PADRAO`). (3) Autorização manual de WhatsApp exige **motivo** (auditoria guarda a situação anterior); quem recusou só volta a “autorizou” pela mão de um gestor/admin. (4) **Modo teste não consome a cobrança real:** itens enviados em modo teste ficam `modo_teste=true` e, ao desligar o modo teste (`PUT /config`), a chave (etapa+boleto+canal) deles é liberada (`#teste`). (5) Envio de e-mail passa a ter trava de **um por vez** (advisory lock 7731002; WhatsApp 7731001), conexões de lock em AUTOCOMMIT, e relê chave geral/horário/modo teste/limite a CADA item; reservas usam `reservado_em`. (6) **Validade da etapa:** “vence hoje” só no dia (offset 0), lembrete só antes do vencimento, atraso/bloqueio com folga; na aprovação e no envio item fora do prazo, etapa desligada ou superada por etapa mais avançada vira `resolvido`. (7) `externalReference` do Asaas (`ss_X|AAAA-MM`) é normalizado para `ss_<cnpj>` (`id_canonico`). (8) Pagamento manual (`payment_records`, últimos 3 dias) impede a cobrança. (9) Resultado de envio já feito é gravado de forma resistente — nunca vira `falhou` (evita o “Reenviar” duplicar); 2xx da Umbler sem ID = `enviado`/entrega `desconhecido`. (10) Disjuntor por taxa só considera mensagens DEPOIS do último religamento, fora de modo teste e sem “número sem WhatsApp”; canal “não encontrado” só avisa (não pausa). (11) Rotina em background com um `try` por passo; geração automática marca o dia ANTES de gerar. (12) Cooldown (429) em `/gerar` (10 s), `/whatsapp/atualizar-estados` (20 s) e `/devolucoes/ler` (30 s). (13) Opt-out do WhatsApp lido em rodízio sem prazo (quem aceitou há meses ainda é conferido); cursor de respostas avança até a última mensagem lida.
- **Limites conhecidos (não resolvidos de propósito):** senhas/token ficam em texto puro em `system_settings` (mesmo padrão das chaves do Asaas; mascarados na API/auditoria; cifrar é evolução); sem política de retenção LGPD para `cobranca_envios`/respostas; DDDs inexistentes não são validados; aprovação/leitura de devoluções em caixa muito cheia olha só as últimas 300 mensagens; feriados municipais só pela lista `regua_feriados_extra`; deploy durante a janela de envio pode deixar um item `enviando` (vira `falhou` após 10 min — conferir antes de reenviar).

## Clientes — proteção da aba (24/10/2026, corrigido no ambiente de teste; ver status de publicação com o Diego)
`routers/clients.py`: ver a lista exige **acesso ao Faturamento (`can_view_faturamento`) E a permissão própria `can_view_fat_clientes`** (as duas; uma sem a outra não basta) (liberada por perfil e por usuário em Gestão de Acessos > Faturamento > “Aba Clientes (cadastro)”; padrão: Admin, Gestor, Contas a Receber e Backoffice SIM; Suporte Técnico, Logística e Comercial NÃO — o Diego libera quem precisar); lista de **bancos** (agência, conta, PIX) e **exportação** exigem `can_edit_billing`; editar/importar/sincronizar/bancos já exigiam `can_edit_billing`. Edição e importação validam e-mail (vários, normalizados), telefone, CEP (8 dígitos), UF e tamanhos; linha ruim é pulada inteira e relatada; `id_smart` precisa ser `ss_<dígitos>` (nada de `nan`); importação limitada a 5 MB/20 mil linhas; exportação neutraliza texto que começa com `= + - @` (injeção de fórmula); tudo grava em `audit_logs` (`clients.editar`, `clients.import`, `clients.export`, `clients.banco_*`, `clients.sync_asaas`); sincronizar com o Asaas tem intervalo de 5 min. Frontend: `/clientes` (rotas aninhadas) e o item do menu exigem as duas; Bancos/Planilha/Editar só aparecem para quem tem `can_edit_billing`.

## Servidor — backup do banco e proteção de portas (24/10/2026)
- **Backup do banco** (scripts versionados em `ops/`, instalados em `/opt/backups/`, ver `ops/README.md`): `pg_dump -Fc` todo dia **02:30** (cron do root) em `/opt/backups/gestora-smart/diario/` — 7 diários, 5 semanais, 6 mensais, + `.env`/compose/nginx/uploads em `config/` (permissão 600); validação do arquivo + SHA-256; `ULTIMO_OK`/`ULTIMO_ERRO`. **Teste de restauração** semanal (domingo 04:30): restaura num banco temporário, compara contagens e apaga. As cópias ficam no MESMO disco do servidor: ainda falta cópia/snapshot para fora (DigitalOcean Backups/Spaces ou cópia periódica para o Mac) — decisão do Diego.
- **Portas**: `docker-compose.yml` publica db (5432), backend (8000), frontend (4000), guardião (3002) e estoque (3003) só em `127.0.0.1` (o Docker ignora o ufw em portas publicadas; antes o Postgres e a API ficavam abertos para a internet). O site continua pelo nginx do host (HTTPS) → `127.0.0.1`. Acesso de fora ao banco: túnel SSH `ssh -L 5432:127.0.0.1:5432 root@147.182.143.83`.
- **Cuidado com scripts em produção:** nunca importar `app.main` num processo novo (roda migrações e pode esperar lock); verificar por HTTP em `127.0.0.1:8000`.
- **Aba Clientes sem dados bancários (24/10/2026, pedido do Diego):** a planilha exportada termina em `banco` (saíram agência, conta, dígito, tipo de chave Pix e chave Pix); a tela de Bancos e `/clients/banks` só têm o NOME. As colunas `banks.agencia/conta/digito/tipo_chave_pix/chave_pix` continuam no banco de dados (dados antigos intactos e reversíveis), mas nada no sistema as lê nem grava mais.

## Régua de cobrança — e-mail completo com o boleto (24/10/2026, pedido do Diego; no teste, aguardando aprovação para publicar)
- **Regra:** o e-mail de cobrança SEMPRE leva o boleto — Itaú: **PDF anexado** (+ linha digitável para copiar e colar, quando o PDF a traz); Asaas: **link da fatura** (`invoice_url`, botão “Ver fatura e pagar”). Sem boleto/link o e-mail é SEGURADO (status novo **`sem_boleto`**, “Aguardando boleto” na Fila; não é falha e não pode ser aprovado); quando o PDF é vinculado, volta sozinho para `pendente`. A checagem repete na hora do envio (se o PDF sumir, volta a `sem_boleto`).
- **Boletos do Itaú em PDF:** aba **Boletos Itaú** (Cobrança). O analista sobe PDFs/ZIP; `services/boletos_itau.py` valida (assinatura %PDF, ≤2 MB, ≤6 páginas, ZIP sem gravar em disco, ≤600 arquivos), lê o texto (pypdf, só texto — nunca renderiza) e casa com `itau_boletos` em aberto por **CNPJ/CPF do pagador + vencimento + valor** (o `nosso_numero` do sistema é curto, 3–4 dígitos: só desempata). Fluxo em duas etapas: **analisar** (não grava) e **vincular**. Resultados: ok, divergente (CNPJ+nº batem mas valor/vencimento não — só sugere, exige vínculo manual), ambíguo, sem correspondência, PDF sem texto, inválido, já tem PDF, repetido. PDFs ficam em `cobranca_boletos_itau` (BYTEA, entram no backup do banco). Endpoints `/cobranca/boletos-itau` (listar, `/upload`, `/{nosso}/pdf`, DELETE); permissão `can_edit_billing`.
- **E-mail:** `cobranca.montar_email` monta texto + HTML (cartão com competência, valor, vencimento, forma de pagamento, botão/aviso de anexo, rodapé); o bloco de pagamento é garantido mesmo que o texto da etapa seja editado sem `{link}`; anexo `Boleto_<competência>_<cliente>.pdf`. WhatsApp não mudou (Itaú sem link continua com o texto de segunda via).
- **Calibração com boleto REAL (24/10/2026, `Boleto_2ETELECOM.pdf`):** o PDF do Itaú tem texto extraível; traz CNPJ do pagador (`Pagador: … CNPJ/CPF: 52.429.856/0001-80`), vencimento, `Valor do Documento 6.333,17` e a linha digitável (`34191.57007 00076.550037 23240.300006 1 16360000633317`). O **“Nosso Número” do PDF (157 / 00000765 - 5) NÃO bate com o `nosso_numero` do sistema (7652)** — por isso o vínculo é por CNPJ+vencimento+valor e o número só reforça (o nome do arquivo `Boleto_<NOME>.pdf` desempata quando dois boletos do mesmo cliente têm mesmo vencimento e valor). A data vem colada no texto seguinte (`20/10/2026Núm.`): regex sem `\b`. Falta validar o lote inteiro (47 PDFs da pasta Boletos Itau) pela própria tela em modo ‘analisar’, que não grava nada.
