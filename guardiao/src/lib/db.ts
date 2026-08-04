import postgres from "postgres"

// Banco próprio do Guardião migrado de Neon (serverless externo) para
// Postgres no mesmo droplet DigitalOcean do resto do sistema (01/08/2026,
// pedido do Diego — "todo o padrão do sistema está no Digital hoje").
// `postgres` (porsager/postgres) usa a mesma sintaxe de template tag
// (sql`SELECT ...`) que @neondatabase/serverless, então nenhum dos ~27
// arquivos que chamam `sql\`...\`` precisou mudar — só este arquivo.
if (!process.env.GUARDIAO_DATABASE_URL) {
  throw new Error("GUARDIAO_DATABASE_URL não definida no .env.local")
}

export const sql = postgres(process.env.GUARDIAO_DATABASE_URL, { ssl: false })
