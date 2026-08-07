import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { syncNow } from "./sync";

// Sincroniza automaticamente com a nuvem quando há conexão: ao abrir o app,
// ao voltar a ficar em primeiro plano e a cada INTERVALO_MS enquanto estiver
// aberto. Falhas de conexão são silenciosas (o app continua offline-first).
const INTERVAL_MS = 10 * 60 * 1000;

export function useAutoSync(token: string | null, enabled: boolean) {
  const syncing = useRef(false);

  const run = async () => {
    if (!token || !enabled || syncing.current) return;
    syncing.current = true;
    try {
      await syncNow(token);
    } catch {
      // Sem conexão no momento — será tentado novamente no próximo ciclo.
    } finally {
      syncing.current = false;
    }
  };

  useEffect(() => {
    if (!token || !enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });

    run();
    timer = setInterval(run, INTERVAL_MS);

    return () => {
      sub.remove();
      if (timer) clearInterval(timer);
    };
  }, [token, enabled]);
}
