import { sql } from "./db";
import type { AppState } from "./types";

// Persistência em Postgres (banco estoque_db, ver src/lib/db.ts e schema.ts).
// Mantém a MESMA interface (getState/setState/setNovaCompra) que a versão
// anterior em arquivo (data/state.json) usava — nenhuma tela ou lib de
// agregação precisou mudar por causa desta troca.

const CHAVES: (keyof AppState)[] = ["estoqueSmart", "estoqueSmt", "pedidos", "novasCompras"];

const ESTADO_VAZIO: AppState = {
  estoqueSmart: null,
  estoqueSmt: null,
  pedidos: null,
  novasCompras: {},
};

export async function getState(): Promise<AppState> {
  const linhas = await sql<{ key: string; value: unknown }[]>`
    SELECT key, value FROM estoque_state WHERE key = ANY(${CHAVES})
  `;

  const estado = { ...ESTADO_VAZIO };
  for (const { key, value } of linhas) {
    (estado as Record<string, unknown>)[key] = value;
  }
  return estado;
}

export async function setState(partial: Partial<AppState>): Promise<AppState> {
  for (const [key, value] of Object.entries(partial)) {
    await sql`
      INSERT INTO estoque_state (key, value, updated_at)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }
  return getState();
}

export async function setNovaCompra(operadora: string, valor: number): Promise<AppState> {
  const atual = await getState();
  const novasCompras = { ...atual.novasCompras, [operadora]: valor };
  return setState({ novasCompras });
}
