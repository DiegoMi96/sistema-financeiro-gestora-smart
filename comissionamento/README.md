# Comissionamento — Motor de Regras (protótipo validado)

Sistema de comissionamento por perfil (Vendedor, Dealer, Indicador, Projeto Especial,
Gestor de Operações, Diretor Comercial, Diretor Administrativo). Aplicação estática
(shell `index.html` + um HTML por perfil, comunicando via `localStorage` — todos os
arquivos são a mesma origem). Desde 2026-09-27, o **extrato pós-cálculo** (o detalhe
por colaborador/mês que vira o `.xlsx` do botão "↓ Extrair") é persistido num banco
real (tabela `comissao_extratos` no Postgres do backend principal) — ver
`REGRAS_DE_NEGOCIO.md` para os detalhes. O resto dos dados (cadastro, metas, faixas,
lançamentos mensais) ainda vive só no `localStorage`.

## Como é servido

Mesmo padrão da Controladoria: o nginx do servidor (`sistema.gestorasmart.com.br`)
serve esta pasta diretamente, sem precisar de rebuild de container.

```nginx
location /comissionamento/ {
    alias /opt/gestora-smart/comissionamento/;
    index index.html;
}
```

Deploy: `git push` → no servidor `git pull`. O nginx já serve a versão nova assim
que o `git pull` termina.

## Origem

Construído do zero (não é o módulo antigo removido em 08/09/2026 — aquele era só uma
casca visual com dados fictícios fixos no código, sem motor de cálculo real). Este é
um protótipo validado ao longo de várias sessões de trabalho com o Diego: toda regra
de negócio (faixas de comissão, Bateu-Levou, Bônus de Célula, Equipamento, Smart GPS,
Projeto Especial, etc.) foi conferida contra planilhas reais antes de entrar aqui.
Ver `REGRAS_DE_NEGOCIO.md` nesta mesma pasta para o histórico completo de decisões e
validações — leia antes de alterar qualquer cálculo ou fluxo.

## Observações (pendências futuras, NÃO alteradas agora)

- **Sem login próprio ainda** — não bloqueia a persistência do extrato porque o
  front reaproveita o JWT que já está em `localStorage['token']` (mesma origem,
  mesmo padrão que a Controladoria já usa) — mas ainda precisa ser unificado de
  verdade com o login do sistema principal (mesmo padrão do Guardião/Estoque).
- **Banco de dados parcial** — só o extrato pós-cálculo (`comissao_extratos`) foi
  migrado pro Postgres do backend principal, com retenção de 1 ano (ver
  `app/services/comissionamento_retention.py` no backend). O resto (cadastro de
  vendedores/dealers/indicadores/projetos, metas, faixas, regras de comissão,
  lançamentos mensais/`mdata`) ainda vive só no `localStorage` — cada pessoa que
  acessa vê uma base independente. Migrar esse restante pro mesmo banco é o
  próximo passo.
- É aberto em **iframe de tela cheia** a partir de `/comissionamento/dash` no app
  React (mesmo padrão da Controladoria).
