# Como trabalhar com o Claude Code

## Instalação (uma vez só)

### 1. Instalar Node.js
https://nodejs.org → baixar versão **LTS** → instalar

### 2. Instalar o Claude Code
```bash
npm install -g @anthropic-ai/claude-code
```

### 3. Instalar o Git
https://git-scm.com/download/win (Windows) — Mac já tem

---

## Configuração do projeto (uma vez só)

### 1. Extrair o zip
Extraia o `gestora-smart-v1.1.zip` em uma pasta, por exemplo:
- Windows: `C:\projetos\gestora-smart`
- Mac: `~/projetos/gestora-smart`

### 2. Instalar dependências do frontend
```bash
cd C:\projetos\gestora-smart\frontend     # Windows
cd ~/projetos/gestora-smart/frontend      # Mac

npm install
```

### 3. Instalar dependências do backend
```bash
cd C:\projetos\gestora-smart\backend      # Windows
cd ~/projetos/gestora-smart/backend       # Mac

pip install -r requirements.txt
```

---

## Abrir o Claude Code

Sempre que for trabalhar no projeto:

```bash
cd C:\projetos\gestora-smart     # Windows
cd ~/projetos/gestora-smart      # Mac

claude
```

Na primeira vez pedirá login com sua conta Anthropic — siga as instruções na tela.

**O Claude Code lê o arquivo `CLAUDE.md` automaticamente.** Isso significa que ele já conhece todo o contexto do sistema sem você precisar explicar nada a cada sessão.

---

## Rodar o sistema localmente

Com o Claude Code aberto, você pode pedir para ele rodar o sistema. Ou fazer manualmente:

**Terminal 1 — Backend:**
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Acesse: http://localhost:3000

> Para o banco de dados local você precisa ter o PostgreSQL instalado,
> ou usar o Docker: `docker compose up db -d`

---

## Fluxo de trabalho do dia a dia

```
1. Abrir o terminal na pasta do projeto
2. Digitar: claude
3. Descrever o que quer em português
4. Claude Code faz as alterações
5. Testar no navegador (http://localhost:3000)
6. Repetir até estar certo
7. Quando estiver pronto → enviar para o DigitalOcean
```

---

## Como pedir alterações — exemplos práticos

Seja específica. Quanto mais contexto, melhor o resultado.

**Correção de cálculo:**
> "O excedente está sendo calculado errado para linhas com franquia de 50MB.
> O valor está vindo zerado mas deveria ser R$4,00. Veja a linha com
> ICCID 8955... no ciclo de maio."

**Nova funcionalidade:**
> "Quero um botão de exportar PDF na tela de detalhe do ciclo que gere
> um relatório com: total faturado, breakdown por componente (mensalidade,
> ativação, excedente, multa, SMS, frete) e top 10 clientes por valor."

**Ajuste visual:**
> "A tabela de linhas do cliente está cortando o ICCID. Precisa mostrar
> o número completo. E quero que linhas com status Cancelamento fiquem
> com fundo vermelho claro."

**Dúvida sobre o código:**
> "Me explica como o motor de faturamento calcula os dias para linhas
> suspensas. Quero entender antes de validar os números."

---

## Atalhos úteis do Claude Code

| Ação | Como fazer |
|---|---|
| Sair | `Ctrl+C` ou digitar `exit` |
| Ver arquivo | Perguntar: "me mostra o conteúdo de billing_engine.py" |
| Rodar comando | Perguntar: "rode o backend para testar" |
| Desfazer | Perguntar: "desfaz a última alteração" |
| Ver o que mudou | `git diff` (no terminal separado) |

---

## Salvar alterações (Git)

Após cada sessão de trabalho, salve o que foi feito:

```bash
git add .
git commit -m "descreva o que foi feito"
```

Exemplos de mensagens de commit:
- `"corrige cálculo de excedente para franquia 50MB"`
- `"adiciona exportação PDF do resumo mensal"`
- `"ajusta layout da tela de detalhe do cliente"`

---

## Quando estiver pronto para subir no DigitalOcean

Siga o **GUIA_INSTALACAO_GESTORA_SMART.md** a partir da Parte 2.

O comando para enviar as alterações para o servidor é:
```bash
scp -r . root@SEU-IP:/opt/gestora-smart/gestora-smart
```

E no servidor para atualizar:
```bash
cd /opt/gestora-smart/gestora-smart
docker compose up -d --build
```
