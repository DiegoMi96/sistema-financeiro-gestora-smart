import { promises as fs } from "fs";
import path from "path";
import type { AppState } from "./types";

// Persistência simples em arquivo JSON local — placeholder de desenvolvimento.
// Antes de ir para produção/nuvem isso deve ser trocado por Supabase (Postgres),
// mantendo a mesma interface (getState / setState) para não precisar mexer nas telas.

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "state.json");

const ESTADO_VAZIO: AppState = {
  estoqueSmart: null,
  estoqueSmt: null,
  pedidos: null,
  novasCompras: {},
};

async function garantirArquivo(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(ESTADO_VAZIO, null, 2), "utf-8");
  }
}

export async function getState(): Promise<AppState> {
  await garantirArquivo();
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  // O merge com ESTADO_VAZIO cobre chaves novas adicionadas depois que o
  // arquivo em disco foi gravado pela última vez (evolução de schema).
  return { ...ESTADO_VAZIO, ...(JSON.parse(raw) as Partial<AppState>) };
}

export async function setState(partial: Partial<AppState>): Promise<AppState> {
  const atual = await getState();
  const novo: AppState = { ...atual, ...partial };
  await fs.writeFile(DATA_FILE, JSON.stringify(novo, null, 2), "utf-8");
  return novo;
}

export async function setNovaCompra(operadora: string, valor: number): Promise<AppState> {
  const atual = await getState();
  const novasCompras = { ...atual.novasCompras, [operadora]: valor };
  return setState({ novasCompras });
}
