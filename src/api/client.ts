// Endereço da API (backend). Para desenvolvimento local, troque pelo IP da
// sua máquina na mesma rede (ex.: http://192.168.0.10:3000). Para produção,
// defina EXPO_PUBLIC_API_URL na hora do build (ex.: eas build).
const DEFAULT_API_URL = "http://192.168.0.10:3000";

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
  opts: { method?: string; body?: any; token?: string | null } = {}
): Promise<any> {
  const { method = "GET", body, token } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      "Sem conexão com o servidor. Verifique sua internet e tente novamente.",
      0
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error || `Erro ${res.status}`, res.status);
  }
  return data;
}
