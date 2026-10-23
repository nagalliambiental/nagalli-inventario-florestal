// Endereço da API (backend).
// Produção: https://nagalli-api.onrender.com
// Para desenvolvimento local, troque pelo IP da sua máquina na mesma rede
// (ex.: http://192.168.0.10:3000) ou defina EXPO_PUBLIC_API_URL no build.
const DEFAULT_API_URL = "https://nagalli-api.onrender.com";

export const API_URL =
  (process.env.EXPO_PUBLIC_API_URL as string) || DEFAULT_API_URL;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch(
  path: string,
  opts: { method?: string; body?: any; token?: string | null; timeoutMs?: number } = {}
): Promise<any> {
  const { method = "GET", body, token, timeoutMs = 60000 } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // Sem timeout o app ficava esperando para sempre no sinal fraco de campo.
  const controller: AbortController | null =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
  } catch {
    throw new ApiError(
      controller?.signal?.aborted
        ? "O servidor demorou para responder. Tente novamente quando houver melhor sinal."
        : "Sem conexão com o servidor. Verifique sua internet e tente novamente.",
      0
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error || `Erro ${res.status}`, res.status);
  }
  return data;
}
