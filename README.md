# Gestora Smart — Sistema Financeiro

Sistema web completo para faturamento, contestação e comissionamento.

## Stack

- **Backend**: Python 3.12 + FastAPI + SQLAlchemy
- **Banco**: PostgreSQL 16
- **Frontend**: React 18 + Vite + Tailwind CSS
- **Deploy**: Docker + Docker Compose
- **Servidor**: DigitalOcean Droplet

---

## Configuração inicial (DigitalOcean)

### 1. Criar o Droplet
- Ubuntu 24.04 LTS
- Mínimo: 2 vCPU / 4GB RAM (recomendado para processar os arquivos grandes)
- Habilitar firewall: portas 22, 80, 443, 3000, 8000

### 2. Instalar Docker
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### 3. Clonar e configurar
```bash
git clone <seu-repositorio> gestora-smart
cd gestora-smart

cp .env.example .env
nano .env   # preencha as variáveis
```

### 4. Variáveis de ambiente (.env)
```
DB_PASSWORD=senha-segura-aqui
SECRET_KEY=gere-com-python-secrets-token-hex-32
ASAAS_API_KEY=sua-chave-api-asaas
FRONTEND_URL=https://seu-dominio.com.br
VITE_API_URL=https://seu-dominio.com.br/api
```

### 5. Subir o sistema
```bash
docker compose up -d --build
```

### 6. Verificar
```bash
docker compose ps          # todos devem estar healthy
curl http://localhost:8000/health
```

---

## Acesso inicial

Após subir, acesse `http://IP-DO-SERVIDOR:3000`

Usuário admin criado automaticamente:
- **E-mail**: admin@gestorasmart.com.br
- **Senha**: Gestora@2024

⚠️ Troque a senha no primeiro acesso!

---

## Estrutura do sistema

```
gestora-smart/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── config.py            # Configurações (.env)
│   │   ├── database.py          # Conexão PostgreSQL
│   │   ├── models/              # Tabelas do banco
│   │   ├── routers/
│   │   │   ├── auth.py          # Login e usuários
│   │   │   ├── billing.py       # Faturamento
│   │   │   └── dashboard.py     # Dashboard
│   │   ├── services/
│   │   │   ├── billing_engine.py  # Motor de faturamento
│   │   │   ├── asaas_client.py    # Integração Asaas
│   │   │   ├── pdf_generator.py   # Geração de faturas PDF
│   │   │   └── excel_generator.py # Exportação Excel
│   │   └── core/
│   │       ├── security.py      # JWT e senhas
│   │       └── permissions.py   # Controle de acesso
│   └── Dockerfile
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── auth/            # Login, usuários
│       │   ├── billing/         # Faturamento
│       │   └── dashboard/       # Dashboard
│       ├── services/api.js      # Chamadas à API
│       └── contexts/            # Estado global
└── docker-compose.yml
```

---

## Perfis de acesso

| Perfil            | Dashboard | Faturamento | Aprovar | Usuários | Contestação |
|-------------------|:---------:|:-----------:|:-------:|:--------:|:-----------:|
| Administrador     | ✅        | ✅ editar   | ✅      | ✅       | ✅          |
| Gestor            | ✅        | 👁 ver      | ✅      | ❌       | ✅          |
| Contas a Receber  | ✅        | ✅ editar   | ❌      | ❌       | ❌          |
| Suporte Técnico   | ❌        | ❌          | ❌      | ❌       | ✅          |

Permissões individuais sobrescrevem o perfil padrão.

---

## Atualizar o sistema
```bash
git pull
docker compose up -d --build
```

## Backup do banco
```bash
docker compose exec db pg_dump -U postgres gestora_smart > backup_$(date +%Y%m%d).sql
```

## Próximas etapas
- [ ] Módulo de Contestação
- [ ] Módulo de Comissionamento
- [ ] Configuração de domínio + HTTPS (Nginx + Certbot)
- [ ] Geração de PDF da fatura
- [ ] Exportação para Asaas (criação de cobranças)
