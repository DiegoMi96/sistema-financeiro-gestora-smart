# Controladoria — Dashboard Gerencial

Dashboard financeiro gerencial (DFC, DRE, fluxo de caixa, resumo executivo, vendas,
suporte, logística, RH). Aplicação single-file (`index.html`) que lê dados do
**Google Sheets** através do backend principal (`/api/...`).

## Como é servido

O nginx do servidor (`sistema.gestorasmart.com.br`) serve esta pasta diretamente:

```nginx
location /controladoria/ {
    alias /opt/gestora-smart/controladoria/;
    index index.html;
}
```

Como `/opt/gestora-smart/` é o checkout deste repositório no servidor, o deploy da
Controladoria passou a seguir o mesmo fluxo do resto do sistema: `git push` → no
servidor `git pull`. **Não requer rebuild de container** — o nginx serve o arquivo
estático diretamente.

## Origem

Este `index.html` foi trazido do projeto separado
"Sistema Financeiro - Report Mensal" e versionado aqui em 25/07/2026, **sem qualquer
alteração de comportamento** (md5 idêntico ao que estava em produção:
`53194094e6c447727806da3248688708`). Antes era um arquivo avulso, não versionado, no
servidor.

## Observações (pendências futuras, NÃO alteradas agora)

- O dashboard tem **login próprio** — ainda não unificado com o login do sistema.
- É aberto em **iframe de tela cheia** a partir de `/controladoria/dash` no app React.
- Fonte de dados: **Google Sheets** (migração para banco próprio a decidir depois).
