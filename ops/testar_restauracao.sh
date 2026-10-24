#!/usr/bin/env bash
# Prova que o ÚLTIMO backup restaura de verdade: cria um banco temporário, restaura, compara contagens com o banco real
# e apaga o temporário. Não altera o banco de produção. Agendado semanalmente (domingo 04:30). Ver ops/README.md.
set -euo pipefail
export LC_ALL=C
APP=/opt/gestora-smart
DEST=/opt/backups/gestora-smart
log() { echo "$(date '+%F %T') [restauração] $*"; }
exec 9>/var/lock/backup-gestora.lock
flock -n 9 || { log "backup em andamento; teste adiado"; exit 0; }

ULT=$(ls -1t "$DEST"/diario/gestora_smart_*.dump 2>/dev/null | head -1 || true)
[ -n "$ULT" ] || { log "ERRO: nenhum backup encontrado"; exit 1; }
( cd "$DEST/diario" && sha256sum -c "$(basename "$ULT").sha256" >/dev/null ) || { log "ERRO: checksum do backup não confere"; exit 1; }
DB="restore_test_$(date +%H%M%S)"
cd "$APP"
psql_db() { docker compose exec -T db psql -U postgres -d "$1" -tA -c "$2"; }
limpa() { docker compose exec -T db psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1 || true; }
trap limpa EXIT
log "restaurando $(basename "$ULT") em $DB"
docker compose exec -T db psql -U postgres -d postgres -c "CREATE DATABASE $DB" >/dev/null
nice -n 10 ionice -c3 docker compose exec -T db pg_restore -U postgres -d "$DB" --no-owner --exit-on-error < "$ULT"
OK=1
for T in users billing_cycles billing_client_summaries billing_lines asaas_payments_sync asaas_customers_sync client_profiles itau_boletos system_settings audit_logs; do
  A=$(psql_db gestora_smart "select count(*) from $T"); B=$(psql_db "$DB" "select count(*) from $T")
  # o banco real continua recebendo dados; aceitamos diferença pequena a mais no real (dados novos depois do backup)
  if [ "$B" -le "$A" ] && [ "$B" -ge $(( A * 98 / 100 )) ]; then log "ok  $T: real=$A restaurado=$B"; else log "DIVERGE $T: real=$A restaurado=$B"; OK=0; fi
done
[ "$OK" = 1 ] && { log "RESULTADO: restauração validada"; date '+%F %T' > "$DEST/ULTIMA_RESTAURACAO_OK"; } || { log "RESULTADO: FALHOU"; date '+%F %T' > "$DEST/ULTIMA_RESTAURACAO_FALHOU"; exit 1; }
