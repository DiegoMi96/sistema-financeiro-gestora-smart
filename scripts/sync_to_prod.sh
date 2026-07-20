#!/usr/bin/env bash
# =============================================================================
# sync_to_prod.sh — Sincroniza dados locais para o servidor de produção
# Funciona com INSERT ON CONFLICT DO NOTHING (sem duplicatas)
#
# USO:
#   chmod +x scripts/sync_to_prod.sh
#   ./scripts/sync_to_prod.sh
#
# CONFIGURAÇÃO (preencha as variáveis abaixo antes de rodar):
# =============================================================================

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURAÇÃO — edite aqui antes de rodar
# ──────────────────────────────────────────────────────────────────────────────

# Servidor de produção (SSH)
PROD_SSH_USER="root"                  # usuário SSH do servidor
PROD_SSH_HOST=""                      # IP ou hostname do servidor (ex: 143.198.xxx.xxx)
PROD_SSH_PORT="22"                    # porta SSH (padrão 22)

# Banco de dados de produção (dentro do servidor)
PROD_DB_PASSWORD="gestora2024"        # senha do PostgreSQL em produção (veja .env do servidor)
PROD_DB_NAME="gestora_smart"
PROD_DB_USER="postgres"
PROD_CONTAINER="gestora-smart-db-1"   # nome do container Docker no servidor

# Local (banco de origem — seu Mac)
LOCAL_CONTAINER="gestora-smart-db-1"
LOCAL_DB_NAME="gestora_smart"
LOCAL_DB_USER="postgres"

# Arquivo temporário do dump
DUMP_FILE="/tmp/gestora_sync_$(date +%Y%m%d_%H%M%S).sql"

# Tabelas a EXCLUIR da sincronização (configurações específicas do ambiente)
# users: para não sobrescrever senhas de produção (adicione os usuários manualmente)
# system_settings: configurações de ambiente (logo, URL, etc.)
# audit_logs: logs históricos — não relevantes para produção
EXCLUDE_TABLES="users system_settings audit_logs"

# ──────────────────────────────────────────────────────────────────────────────
# VERIFICAÇÕES INICIAIS
# ──────────────────────────────────────────────────────────────────────────────

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Gestora Smart — Sync Local → Produção                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

if [[ -z "$PROD_SSH_HOST" ]]; then
  echo "❌ ERRO: PROD_SSH_HOST não configurado."
  echo "   Edite o arquivo scripts/sync_to_prod.sh e preencha o IP do servidor."
  exit 1
fi

echo "📍 Origem:  localhost (Docker: $LOCAL_CONTAINER)"
echo "📍 Destino: $PROD_SSH_USER@$PROD_SSH_HOST"
echo "📦 Tabelas excluídas: $EXCLUDE_TABLES"
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# PASSO 1 — Dump local com INSERT ON CONFLICT DO NOTHING
# ──────────────────────────────────────────────────────────────────────────────

echo "▶ Passo 1/4: Gerando dump do banco local..."

# Monta os argumentos de exclusão
EXCLUDE_ARGS=""
for tbl in $EXCLUDE_TABLES; do
  EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude-table=$tbl"
done

docker exec "$LOCAL_CONTAINER" pg_dump \
  -U "$LOCAL_DB_USER" \
  --data-only \
  --inserts \
  --on-conflict-do-nothing \
  --no-owner \
  --no-privileges \
  $EXCLUDE_ARGS \
  "$LOCAL_DB_NAME" > "$DUMP_FILE"

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
echo "   ✅ Dump gerado: $DUMP_FILE ($DUMP_SIZE)"

# ──────────────────────────────────────────────────────────────────────────────
# PASSO 2 — Transferir para o servidor via SCP
# ──────────────────────────────────────────────────────────────────────────────

echo ""
echo "▶ Passo 2/4: Transferindo para o servidor ($PROD_SSH_HOST)..."

scp -P "$PROD_SSH_PORT" \
  "$DUMP_FILE" \
  "$PROD_SSH_USER@$PROD_SSH_HOST:/tmp/gestora_sync.sql"

echo "   ✅ Arquivo transferido"

# ──────────────────────────────────────────────────────────────────────────────
# PASSO 3 — Restaurar no servidor de produção
# ──────────────────────────────────────────────────────────────────────────────

echo ""
echo "▶ Passo 3/4: Restaurando no banco de produção..."

ssh -p "$PROD_SSH_PORT" "$PROD_SSH_USER@$PROD_SSH_HOST" bash << EOF
  set -e

  echo "   Aplicando dados no container $PROD_CONTAINER..."

  docker exec -i "$PROD_CONTAINER" psql \
    -U "$PROD_DB_USER" \
    -d "$PROD_DB_NAME" \
    -v ON_ERROR_STOP=0 \
    < /tmp/gestora_sync.sql 2>&1 | grep -v "^SET$" | grep -v "^--" | head -30

  echo "   Limpando arquivo temporário..."
  rm -f /tmp/gestora_sync.sql
EOF

echo "   ✅ Dados restaurados"

# ──────────────────────────────────────────────────────────────────────────────
# PASSO 4 — Verificação
# ──────────────────────────────────────────────────────────────────────────────

echo ""
echo "▶ Passo 4/4: Verificando contagem de registros em produção..."

ssh -p "$PROD_SSH_PORT" "$PROD_SSH_USER@$PROD_SSH_HOST" bash << EOF
  docker exec "$PROD_CONTAINER" psql -U "$PROD_DB_USER" -d "$PROD_DB_NAME" -c "
    SELECT
      relname AS tabela,
      n_live_tup AS registros
    FROM pg_stat_user_tables
    WHERE n_live_tup > 0
    ORDER BY n_live_tup DESC;" 2>&1
EOF

# Limpa dump local
rm -f "$DUMP_FILE"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   ✅ Sincronização concluída com sucesso!                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "PRÓXIMOS PASSOS:"
echo "  1. Acesse https://SEU_DOMINIO e faça login"
echo "  2. Verifique se os dados aparecem corretamente"
echo "  3. Crie os usuários de produção em /acessos"
echo "     (usuários foram excluídos para não sobrescrever senhas)"
echo ""
