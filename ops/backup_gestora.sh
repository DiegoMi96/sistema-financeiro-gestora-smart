#!/usr/bin/env bash
# Backup diário do banco do Gestora Smart (PostgreSQL em Docker) + arquivos de configuração.
# Instalado em /opt/backups/backup_gestora.sh e agendado no cron do root (02:30). Ver ops/README.md.
# Seguro por desenho: só LÊ o banco (pg_dump), roda com prioridade baixa, nunca apaga o backup anterior antes
# de o novo estar validado e não roda duas vezes ao mesmo tempo.
set -euo pipefail
export LC_ALL=C
APP=/opt/gestora-smart
DEST=/opt/backups/gestora-smart
MIN_BYTES=1048576
log() { echo "$(date '+%F %T') $*"; }

mkdir -p "$DEST"/diario "$DEST"/semanal "$DEST"/mensal "$DEST"/config
chmod 700 /opt/backups "$DEST"

exec 9>/var/lock/backup-gestora.lock
flock -n 9 || { log "ERRO: já existe um backup em andamento"; exit 1; }

TS=$(date +%F_%H%M)
ARQ="$DEST/diario/gestora_smart_$TS.dump"
trap 'rm -f "$ARQ.tmp"' EXIT
falha() { log "ERRO: $*"; date '+%F %T' > "$DEST/ULTIMO_ERRO"; echo "$*" >> "$DEST/ULTIMO_ERRO"; exit 1; }

cd "$APP"
log "início do backup ($TS)"
nice -n 10 ionice -c3 docker compose exec -T db pg_dump -U postgres -d gestora_smart -Fc -Z 6 --no-owner > "$ARQ.tmp" || falha "pg_dump falhou"
TAM=$(stat -c%s "$ARQ.tmp")
[ "$TAM" -ge "$MIN_BYTES" ] || falha "backup pequeno demais ($TAM bytes)"
docker compose exec -T db pg_restore --list < "$ARQ.tmp" > /dev/null || falha "arquivo de backup inválido (pg_restore --list falhou)"

mv "$ARQ.tmp" "$ARQ"
chmod 600 "$ARQ"
( cd "$DEST/diario" && sha256sum "$(basename "$ARQ")" > "$(basename "$ARQ").sha256" )
log "ok: $(basename "$ARQ") — $((TAM / 1048576)) MB"

# cópias mais antigas: domingo (semanal) e dia 1 (mensal)
if [ "$(date +%u)" = "7" ]; then cp -p "$ARQ" "$ARQ.sha256" "$DEST/semanal/"; fi
if [ "$(date +%d)" = "01" ]; then cp -p "$ARQ" "$ARQ.sha256" "$DEST/mensal/"; fi

# configuração (contém segredos: permissão 600)
tar czf "$DEST/config/config_$TS.tar.gz" -C / opt/gestora-smart/.env opt/gestora-smart/docker-compose.yml \
    opt/gestora-smart/docker-compose.override.yml etc/nginx/sites-enabled 2>/dev/null || log "AVISO: configuração não foi copiada por completo"
chmod 600 "$DEST"/config/config_*.tar.gz 2>/dev/null || true

# arquivos enviados pelo sistema (volume uploads_data), se a imagem alpine já estiver no servidor
if docker image inspect alpine >/dev/null 2>&1; then
  docker run --rm -v gestora-smart_uploads_data:/d:ro -v "$DEST/config":/out alpine tar czf "/out/uploads_$TS.tar.gz" -C /d . 2>/dev/null \
    && chmod 600 "$DEST/config/uploads_$TS.tar.gz" || log "AVISO: volume de uploads não foi copiado"
fi

# retenção: 7 diários, 5 semanais, 6 mensais, 14 de configuração
poda() { { ls -1t "$1"/$2 2>/dev/null || true; } | tail -n +"$(( $3 + 1 ))" | while read -r f; do rm -f "$f" "$f.sha256"; done; true; }
poda "$DEST/diario"  'gestora_smart_*.dump' 7
poda "$DEST/semanal" 'gestora_smart_*.dump' 5
poda "$DEST/mensal"  'gestora_smart_*.dump' 6
poda "$DEST/config"  'config_*.tar.gz' 14
poda "$DEST/config"  'uploads_*.tar.gz' 14

rm -f "$DEST/ULTIMO_ERRO"
date '+%F %T' > "$DEST/ULTIMO_OK"
log "fim — espaço usado pelos backups: $(du -sh "$DEST" | cut -f1); disco livre: $(df -h / | awk 'NR==2{print $4}')"
