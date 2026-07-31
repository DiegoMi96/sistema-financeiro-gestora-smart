import { sql } from "./db"

export async function createSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      cnpj        TEXT,
      name        TEXT NOT NULL,
      consultant_name TEXT,
      phone       TEXT,
      email       TEXT,
      messaging_package TEXT DEFAULT 'Não',
      is_active   BOOLEAN DEFAULT true,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS alerts (
      id               TEXT PRIMARY KEY,
      line_number      TEXT NOT NULL,
      client_name      TEXT,
      cpf_cnpj         TEXT,
      operator         TEXT,
      contract_type    TEXT,
      quota_mb         NUMERIC,
      quota_gb         NUMERIC,
      used_gb          NUMERIC,
      usage_percentage NUMERIC,
      block_status     TEXT,
      competencia      TEXT,
      status           TEXT DEFAULT 'pending',
      triggered_at     TIMESTAMPTZ DEFAULT NOW(),
      marked_as_done_at TIMESTAMPTZ
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS snapshots (
      id                TEXT PRIMARY KEY,
      import_date       TEXT,
      file_name         TEXT,
      competencia       TEXT,
      total_lines       INT DEFAULT 0,
      total_alerts      INT DEFAULT 0,
      pending_day       INT DEFAULT 0,
      resolved_day      INT DEFAULT 0,
      resolved_month    INT DEFAULT 0,
      processing_status TEXT DEFAULT 'success',
      imported_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS pending_day    INT DEFAULT 0`
  await sql`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS resolved_day   INT DEFAULT 0`
  await sql`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS resolved_month INT DEFAULT 0`

  await sql`CREATE INDEX IF NOT EXISTS idx_alerts_line_triggered ON alerts(line_number, triggered_at DESC)`

  await sql`
    CREATE TABLE IF NOT EXISTS skipped_lines (
      id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      line_number      TEXT NOT NULL,
      client_name      TEXT,
      cpf_cnpj         TEXT,
      operator         TEXT,
      contract_type    TEXT,
      quota_mb         NUMERIC,
      used_mb          NUMERIC,
      usage_percentage NUMERIC,
      competencia      TEXT,
      reason           TEXT DEFAULT 'sem_mensageria',
      skipped_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_skipped_lines_at ON skipped_lines(skipped_at DESC)`

  await sql`
    CREATE TABLE IF NOT EXISTS alert_history (
      id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      original_id       TEXT,
      line_number       TEXT NOT NULL,
      client_name       TEXT,
      cpf_cnpj          TEXT,
      operator          TEXT,
      contract_type     TEXT,
      quota_mb          NUMERIC,
      quota_gb          NUMERIC,
      used_gb           NUMERIC,
      usage_percentage  NUMERIC,
      competencia       TEXT,
      triggered_at      TIMESTAMPTZ,
      marked_as_done_at TIMESTAMPTZ,
      archived_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_alert_history_competencia ON alert_history(competencia)`
  await sql`CREATE INDEX IF NOT EXISTS idx_alert_history_archived ON alert_history(archived_at DESC)`

  await sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      action      TEXT NOT NULL,
      entity_type TEXT,
      entity_id   TEXT,
      details     JSONB,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS validation_rules (
      id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      rule_name         TEXT NOT NULL,
      applies_to        TEXT NOT NULL DEFAULT 'all',
      threshold_value   NUMERIC NOT NULL,
      is_active         BOOLEAN DEFAULT true,
      description       TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    INSERT INTO validation_rules (id, rule_name, applies_to, threshold_value, description)
    VALUES
      ('rule-individual', 'Consumo Individual',     'individual', 100, 'Gera acionamento quando linha individual atinge ou ultrapassa 100% da franquia'),
      ('rule-shared',     'Consumo Compartilhado',  'shared',     300, 'Gera acionamento quando linha compartilhada atinge ou ultrapassa 300% da franquia'),
      ('rule-growth',     'Crescimento Rápido',     'all',        30,  'Gera acionamento quando o consumo cresce mais de 30% em 24 horas')
    ON CONFLICT (id) DO NOTHING
  `

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name     TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin','analyst','viewer')),
      is_active     BOOLEAN DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      last_login    TIMESTAMPTZ
    )
  `

  return { ok: true, message: "Schema criado com sucesso." }
}
