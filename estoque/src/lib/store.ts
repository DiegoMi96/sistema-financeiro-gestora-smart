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
    // NÃO usar JSON.stringify aqui: o postgres.js já serializa o valor
    // automaticamente por causa do cast ::jsonb — fazer os dois causa
    // double-encoding (grava uma string contendo JSON em vez de um objeto).
    await sql`
      INSERT INTO estoque_state (key, value, updated_at)
      VALUES (${key}, ${value as never}::jsonb, NOW())
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

// IDs das planilhas do Google Sheets do Cancelamento e da Saída, configurados
// pela tela de Configurações (antes só existiam como variável de ambiente
// fixa — CANCELAMENTO_SHEET_ID/SAIDA_SHEET_ID — exigindo redeploy pra trocar).
// Fora do AppState de propósito: não faz parte do "estado importado", é
// config da aplicação, mas guardado na mesma tabela por simplicidade.
export type ConfiguracaoSheets = {
  cancelamentoSheetId: string | null;
  saidaSheetId: string | null;
};

const CONFIG_SHEETS_KEY = "configuracaoSheets";
const CONFIG_SHEETS_VAZIA: ConfiguracaoSheets = { cancelamentoSheetId: null, saidaSheetId: null };

export async function getConfiguracaoSheets(): Promise<ConfiguracaoSheets> {
  const linhas = await sql<{ value: unknown }[]>`
    SELECT value FROM estoque_state WHERE key = ${CONFIG_SHEETS_KEY}
  `;
  if (linhas.length === 0) return CONFIG_SHEETS_VAZIA;
  return { ...CONFIG_SHEETS_VAZIA, ...(linhas[0].value as Partial<ConfiguracaoSheets>) };
}

export async function setConfiguracaoSheets(partial: Partial<ConfiguracaoSheets>): Promise<ConfiguracaoSheets> {
  const atual = await getConfiguracaoSheets();
  const novo = { ...atual, ...partial };
  await sql`
    INSERT INTO estoque_state (key, value, updated_at)
    VALUES (${CONFIG_SHEETS_KEY}, ${novo as never}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return novo;
}
