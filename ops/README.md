# Operação do servidor (ops/)

Scripts versionados que ficam instalados no servidor de produção (`147.182.143.83`).

## Backup do banco (`backup_gestora.sh`)
- Instalado em `/opt/backups/backup_gestora.sh`; cron do root **todo dia 02:30**; log em `/var/log/backup-gestora.log`.
- Gera `pg_dump -Fc` (comprimido) em `/opt/backups/gestora-smart/diario/`, valida o arquivo, grava checksum SHA-256,
  e mantém **7 diários, 5 semanais (domingo) e 6 mensais (dia 1)**. Também guarda `.env`, compose e nginx (`config/`, permissão 600) e o volume de uploads.
- `ULTIMO_OK` / `ULTIMO_ERRO` na pasta dos backups dizem se o último rodou bem.
- **Não protege contra perda do servidor inteiro**: as cópias estão no mesmo disco. Complemente com backup/snapshot da DigitalOcean ou cópia para fora.

## Teste de restauração (`testar_restauracao.sh`)
- Cron **domingo 04:30**. Restaura o último backup num banco temporário, compara contagens com o banco real e apaga o temporário.
- `ULTIMA_RESTAURACAO_OK` / `ULTIMA_RESTAURACAO_FALHOU` registram o resultado.

## Restaurar de verdade (emergência)
1. `docker compose stop backend`
2. `docker compose exec -T db psql -U postgres -c "ALTER DATABASE gestora_smart RENAME TO gestora_smart_antigo"` e `... "CREATE DATABASE gestora_smart"`
3. `docker compose exec -T db pg_restore -U postgres -d gestora_smart --no-owner < /opt/backups/gestora-smart/diario/<arquivo>.dump`
4. `docker compose start backend` e conferir o sistema. Só apague o banco antigo depois de validar.
