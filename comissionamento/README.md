# Comissionamento — Motor de Regras (protótipo validado)

Sistema de comissionamento por perfil (Vendedor, Dealer, Indicador, Projeto Especial,
Gestor de Operações, Diretor Comercial, Diretor Administrativo). Aplicação estática
(shell `index.html` + um HTML por perfil, comunicando via `localStorage` — todos os
arquivos são a mesma origem). Sem banco de dados próprio ainda.

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

- **Sem login próprio ainda** — precisa ser unificado com o login do sistema
  principal (mesmo padrão do Guardião/Estoque: reusar a `SECRET_KEY`/JWT do backend).
- **Sem banco de dados** — todos os dados (vendedores, metas, faixas, lançamentos
  mensais) vivem só no `localStorage` do navegador de quem abre a tela. Cada pessoa
  que acessa vê uma base vazia e independente das outras. Migração para backend real
  (FastAPI + Postgres, como o Faturamento) é o próximo passo depois desta integração
  inicial.
- É aberto em **iframe de tela cheia** a partir de `/comissionamento/dash` no app
  React (mesmo padrão da Controladoria).
