# 🛡️ Guardião - Sistema de Controle de Consumo de Franquias

Sistema web completo para automação do controle de consumo de linhas móveis da Gestora SMART.

## 📋 Stack Tecnológico

- **Frontend:** Next.js 14 + React 18 + TypeScript + TailwindCSS
- **Backend:** FastAPI + Python 3.11
- **Database:** PostgreSQL 15
- **ORM:** SQLAlchemy 2.0
- **Migrations:** Alembic
- **Containerização:** Docker Compose

## 🚀 Quick Start

### Pré-requisitos
- Docker e Docker Compose instalados
- Node.js 18+ (desenvolvimento local)
- Python 3.11+ (desenvolvimento local)

### Setup com Docker

```bash
# 1. Clone o repositório
git clone <repo-url>
cd guardiao

# 2. Crie o arquivo .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Inicie os containers
docker-compose up -d

# 4. Acesse a aplicação
# Frontend: http://localhost:3000
# Backend: http://localhost:8000
# API Docs: http://localhost:8000/docs
# PgAdmin: http://localhost:5050
```

### Setup Local (Desenvolvimento)

**Backend:**
```bash
cd backend

# Criar ambiente virtual
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Instalar dependências
pip install -r requirements.txt

# Setup do banco
alembic upgrade head

# Executar servidor
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend

# Instalar dependências
npm install

# Executar dev server
npm run dev
```

## 📁 Estrutura do Projeto

```
guardiao/
├── backend/
│   ├── app/
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic validation schemas
│   │   ├── crud/            # Database operations
│   │   ├── api/             # API endpoints
│   │   ├── services/        # Business logic
│   │   ├── utils/           # Utilities
│   │   └── main.py          # FastAPI app
│   ├── migrations/          # Alembic migrations
│   ├── tests/               # Unit tests
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js app directory
│   │   ├── components/      # React components
│   │   ├── hooks/           # Custom hooks
│   │   ├── lib/             # Utilities
│   │   ├── store/           # Zustand stores
│   │   ├── types/           # TypeScript types
│   │   └── styles/          # Global styles
│   └── package.json
│
├── docker-compose.yml
└── README.md
```

## 🔐 Segurança

- JWT com access + refresh tokens
- Passwords hasheadas com bcrypt
- Role-Based Access Control (RBAC)
- Auditoria completa de ações
- Validação Pydantic em todos os endpoints
- CORS configurado

## 🔑 Credenciais Padrão (Desenvolvimento)

**Banco de Dados:**
- User: `guardiao_user`
- Password: `guardiao_password`
- Database: `guardiao`

**PgAdmin:**
- Email: `admin@guardiao.local`
- Password: `admin`

⚠️ **IMPORTANTE:** Altere essas credenciais em produção!

## 📊 Funcionalidades MVP

- ✅ Login com JWT
- ✅ Upload de arquivos .xlsx
- ✅ Processamento automático de dados
- ✅ Geração de acionamentos (Individual ≥100% | Compartilhado ≥300%)
- ✅ Dashboard com KPIs
- ✅ Listagem de acionamentos (pendentes/concluídos)
- ✅ Marcar como acionado
- ✅ Histórico completo
- ✅ Auditoria de ações
- ✅ Filtros avançados
- ✅ Exportação para Excel
- ✅ Perfis (Admin, Supervisor, Analista)
- ✅ Dark mode

## 🔄 Próximas Fases (v1.1+)

- Alertas por email
- Configuração dinâmica de regras
- Notificações em tempo real (WebSocket)
- Plataforma SMART integrada

## 📝 Documentação

- [Arquitetura Completa](./ARCHITECTURE.md)
- [API Docs](http://localhost:8000/docs) (Swagger)
- [Plano de Implementação](./PLAN.md)

## 🧪 Testes

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm run test
```

## 🚢 Deploy

Veja [DEPLOYMENT.md](./DEPLOYMENT.md) para instruções de deploy em produção.

## 🤝 Contribuindo

1. Crie uma branch (`git checkout -b feature/AmazingFeature`)
2. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
3. Push para a branch (`git push origin feature/AmazingFeature`)
4. Abra um Pull Request

## 📄 Licença

Este projeto é propriedade da Gestora SMART.

## ✉️ Contato

Para dúvidas ou sugestões: thalles.marques@gestorasmart.com.br

---

**Desenvolvido com ❤️ para a Gestora SMART**
