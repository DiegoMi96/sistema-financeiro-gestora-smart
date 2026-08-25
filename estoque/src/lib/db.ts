import postgres from "postgres";

// Banco próprio do Controle de Estoque, no mesmo Postgres (mesmo droplet) do
// resto do sistema — mesmo padrão usado no Guardião (guardiao/src/lib/db.ts):
// banco e usuário dedicados (`estoque_db` / `estoque_app`), conectado via
// `postgres` (porsager/postgres), schema em SQL puro, sem ORM.
//
// Sem throw aqui: este módulo é importado durante `next build` (Next.js
// analisa as rotas de API), momento em que as env vars do docker-compose
// ainda não existem (só são injetadas ao rodar o container, não ao buildar
// a imagem) — um throw na importação derruba o build inteiro. A conexão do
// `postgres` é preguiçosa (só conecta na primeira query), então isso é seguro.
if (!process.env.ESTOQUE_DATABASE_URL) {
  console.error("[db] ESTOQUE_DATABASE_URL não definida — queries vão falhar em runtime");
}

export const sql = postgres(process.env.ESTOQUE_DATABASE_URL ?? "", { ssl: false });
