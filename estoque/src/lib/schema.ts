import { sql } from "./db";

// Uma linha por chave do AppState (estoqueSmart, estoqueSmt, pedidos,
// novasCompras) — cada valor é o mesmo objeto que hoje é serializado inteiro
// em data/state.json. Guardamos como JSONB em vez de tabelas relacionais
// próprias por chip/pedido de propósito: toda a lógica de agregação já
// existente (aggregate.ts, parseEstoque.ts, etc.) opera em memória sobre
// esses objetos depois de lidos — trocar a origem de "arquivo" para "linha
// no banco" não exige tocar em nenhuma dessas regras de negócio já validadas.
export async function createSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS estoque_state (
      key         TEXT PRIMARY KEY,
      value       JSONB NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  return { ok: true, message: "Schema criado com sucesso." };
}
