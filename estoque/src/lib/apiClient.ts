"use client";

// Cliente de API do lado do navegador — login unificado com o sistema
// principal (gestora-smart). Não existe sessão própria aqui: cada chamada
// carrega o MESMO token (localStorage 'token') que o app principal grava,
// já que rodamos na mesma origem (sistema.gestorasmart.com.br/estoque).
// NEXT_PUBLIC_API_URL é embutido em build time (ver Dockerfile) para incluir
// o basePath "/estoque" — mesmo truque usado na integração do Guardião.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

// Sem sessão do sistema principal, não há nada a fazer aqui além de voltar
// para a raiz do domínio (fora do basePath) — é lá que mora o login.
function redirectToLogin() {
  if (typeof window !== "undefined") window.location.href = "/";
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new ApiError(401, "Não autorizado.");
  }
  return res;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await request(path);
  if (!res.ok) throw new ApiError(res.status, `Erro ${res.status} ao buscar ${path}`);
  return res.json() as Promise<T>;
}

// POST helpers devolvem o JSON mesmo quando a resposta não é 2xx (as rotas
// de upload/nova-compra sempre respondem {ok, erro?} mesmo em erro) — quem
// chama decide o que fazer inspecionando `.ok`, igual ao fetch original.
export async function apiPostJson<T>(path: string, body: unknown): Promise<T> {
  const res = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  const res = await request(path, { method: "POST", body: formData });
  return res.json() as Promise<T>;
}

// Downloads (exportação Excel) precisam do header Authorization — um <a href>
// comum não carrega o token, então buscamos como blob e disparamos o
// download manualmente.
export async function apiDownload(path: string, fallbackFilename: string): Promise<void> {
  const res = await request(path);
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new ApiError(res.status, texto || `Erro ${res.status} ao exportar`);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? fallbackFilename;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
