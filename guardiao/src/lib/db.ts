import postgres from "postgres"

// Banco próprio do Guardião migrado de Neon (serverless externo) para
// Postgres no mesmo droplet DigitalOcean do resto do sistema (01/08/2026,
// pedido do Diego — "todo o padrão do sistema está no Digital hoje").
// `postgres` (porsager/postgres) usa a mesma sintaxe de template tag
// (sql`SELECT ...`) que @neondatabase/serverless, então nenhum dos ~27
// arquivos que chamam `sql\`...\`` precisou mudar — só este arquivo.
//
// Sem throw aqui: este módulo é importado durante `next build` (Next.js
// analisa as rotas de API), momento em que as env vars do docker-compose
// ainda não existem (só são injetadas ao rodar o container, não ao buildar
// a imagem) — um throw na importação derruba o build inteiro. A conexão do
// `postgres` é preguiçosa (só conecta na primeira query), então isso é seguro.
if (!process.env.GUARDIAO_DATABASE_URL) {
  console.error("[db] GUARDIAO_DATABASE_URL não definida — queries vão falhar em runtime")
}

export const sql = postgres(process.env.GUARDIAO_DATABASE_URL ?? "", { ssl: false })
