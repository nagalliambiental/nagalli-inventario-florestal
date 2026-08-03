import * as SecureStore from "expo-secure-store";

export interface SessionUser {
  uuid: string;
  email: string;
  name: string;
  role: "admin" | "worker";
}

const TOKEN_KEY = "nagalli_session_token";
const USER_KEY = "nagalli_session_user";

export async function saveSession(token: string, user: SessionUser): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function loadSession(): Promise<{ token: string | null; user: SessionUser | null }> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const raw = await SecureStore.getItemAsync(USER_KEY);
  let user: SessionUser | null = null;
  if (raw) {
    try {
      user = JSON.parse(raw);
    } catch {}
  }
  return { token, user };
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}
