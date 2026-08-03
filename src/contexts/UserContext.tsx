import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiLogin } from "../api/auth";
import { loadSession, saveSession, clearSession } from "../api/session";

export interface UserInfo {
  uuid: string;
  email: string;
  name: string;
  role: "admin" | "worker";
}

interface UserContextType {
  user: UserInfo | null;
  token: string | null;
  isAdmin: boolean;
  locked: boolean;
  ready: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
}

const UserContext = createContext<UserContextType>({
  user: null,
  token: null,
  isAdmin: false,
  locked: true,
  ready: false,
  login: async () => "Não conectado",
  logout: () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [locked, setLocked] = useState(true);
  const [ready, setReady] = useState(false);

  // Restaura a sessão salva (login offline após a primeira conexão).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await loadSession();
      if (cancelled) return;
      if (session.user && session.token) {
        setUser(session.user);
        setToken(session.token);
        setLocked(false);
      } else {
        setLocked(true);
      }
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await apiLogin(email, password);
      await saveSession(res.token, res.user);
      setUser(res.user);
      setToken(res.token);
      setLocked(false);
      return null;
    } catch (e: any) {
      return e?.message || "Não foi possível entrar.";
    }
  }, []);

  const logout = useCallback(() => {
    clearSession().catch(() => {});
    setUser(null);
    setToken(null);
    setLocked(true);
  }, []);

  return (
    <UserContext.Provider
      value={{
        user,
        token,
        isAdmin: user?.role === "admin",
        locked,
        ready,
        login,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
