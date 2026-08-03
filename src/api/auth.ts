import { apiFetch } from "./client";
import type { SessionUser } from "./session";

export interface LoginResponse {
  token: string;
  user: SessionUser;
}

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  return apiFetch("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export async function apiRegister(
  token: string | null,
  data: { name: string; email: string; password: string; role?: "worker" | "admin" }
): Promise<{ user: SessionUser }> {
  return apiFetch("/auth/register", {
    method: "POST",
    body: data,
    token,
  });
}

export async function apiMe(token: string): Promise<{ user: SessionUser }> {
  return apiFetch("/auth/me", { token });
}

export async function apiListUsers(token: string): Promise<{ users: SessionUser[] }> {
  return apiFetch("/auth/users", { token });
}

export async function apiDeleteUser(
  token: string,
  uuid: string
): Promise<{ ok: boolean }> {
  return apiFetch(`/auth/users/${uuid}`, { method: "DELETE", token });
}

export async function apiAdminResetPassword(
  token: string,
  uuid: string,
  newPassword: string
): Promise<{ ok: boolean }> {
  return apiFetch(`/auth/users/${uuid}/password`, {
    method: "PUT",
    body: { newPassword },
    token,
  });
}
