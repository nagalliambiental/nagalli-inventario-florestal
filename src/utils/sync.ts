import * as FileSystem from "expo-file-system";
import { apiFetch, ApiError } from "../api/client";
import {
  SYNC_TABLES,
  listRowsForPush,
  applyServerRows,
  getSyncState,
  setSyncState,
  getTreePhoto,
} from "../db/database";
import { LAST_SYNC_KEY, LAST_PULL_KEY } from "../db/database";
import { PHOTOS_DIR, deletePhotoFile } from "./photos";

export interface SyncResult {
  pushed: number;
  pulled: number;
  first: boolean;
}

function detectExt(b64: string): string {
  const head = b64.slice(0, 24);
  if (head.startsWith("/9j/")) return ".jpg";
  if (head.startsWith("iVBORw0KGgo")) return ".png";
  if (head.startsWith("R0lGOD")) return ".gif";
  return ".jpg";
}

// Salva a foto recebida da nuvem no diretório persistente do aparelho.
async function writePhotoData(uuid: string, data: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true }).catch(
    () => {}
  );
  const clean = uuid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  const dest = `${PHOTOS_DIR}sync_${clean}_${Date.now()}${detectExt(data)}`;
  await FileSystem.writeAsStringAsync(dest, data, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return dest;
}

// Fotos: envia também o conteúdo (base64) para que fiquem disponíveis nos
// outros aparelhos (o uri local é só um caminho de arquivo neste celular).
// Lê uma foto por vez para não montar um corpo gigante de uma só vez.
async function photoRowsWithData(rows: any[]): Promise<any[]> {
  const out: any[] = [];
  for (const r of rows) {
    const { data: _data, ...rest } = r;
    let data = "";
    if (rest.uri) {
      try {
        const info = await FileSystem.getInfoAsync(rest.uri);
        if (info.exists) {
          data = await FileSystem.readAsStringAsync(rest.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
      } catch {}
    }
    out.push({ ...rest, data });
  }
  return out;
}

// Transforma as fotos vindas do servidor: grava o arquivo localmente e
// preserva/limpa o uri de acordo (caminho de arquivo local é específico do aparelho).
function makePhotosTransform(token: string) {
  return async (r: any): Promise<any> => {
    const existing = await getTreePhoto(r.uuid);
    if (r.deleted_at > 0) {
      if (existing?.uri) await deletePhotoFile(existing.uri);
      return { ...r, data: "", uri: "", deleted_at: r.deleted_at ?? 0 };
    }

    let existingUri = "";
    if (existing?.uri) {
      try {
        const info = await FileSystem.getInfoAsync(existing.uri);
        if (info.exists) existingUri = existing.uri;
      } catch {}
    }

    let data = existingUri ? "" : r.data || "";
    if (!data && !existingUri) {
      // O servidor novo não envia o conteúdo no pull (economiza memória);
      // baixa apenas a foto que ainda não existe neste aparelho.
      try {
        const resp = await apiFetch(`/sync/photo/${r.uuid}`, { token });
        data = resp?.data || "";
      } catch {}
    }

    if (data) {
      const uri = await writePhotoData(r.uuid, data);
      return { ...r, data: "", uri, deleted_at: r.deleted_at ?? 0 };
    }
    return { ...r, data: "", uri: existingUri, deleted_at: r.deleted_at ?? 0 };
  };
}

// Sincroniza este aparelho com a nuvem: envia as alterações locais e baixa as
// alterações dos outros aparelhos. Requer conexão com a internet.
export async function syncNow(token: string): Promise<SyncResult> {
  // Duas marcas independentes:
  //  - LAST_SYNC_KEY: o que já foi ENVIADO (push)
  //  - LAST_PULL_KEY: o que já foi BAIXADO (pull)
  // Antes eram a mesma, então um download que falhava deixava o projeto local
  // aparecendo como "não enviado" para sempre, mesmo já estando no servidor.
  const lastPushRaw = await getSyncState(LAST_SYNC_KEY);
  const lastPush = lastPushRaw ? parseInt(lastPushRaw, 10) : 0;
  const lastPullRaw = await getSyncState(LAST_PULL_KEY);
  const lastPull = lastPullRaw ? parseInt(lastPullRaw, 10) : 0;
  const first = lastPull === 0;

  // Reenvia uma janela de 24h para absorver diferença de relógio entre o
  // aparelho e o servidor. O upsert no servidor é idempotente.
  const pushSince = Math.max(0, lastPush - 24 * 60 * 60 * 1000);
  // Capturada ANTES do envio: registro criado durante o push volta a ser
  // enviado na próxima rodada.
  const pushStartedAt = Date.now();

  // 1) Push das tabelas comuns: projeto, parcelas, árvores, fustes, espécies.
  let pushed = 0;
  try {
    for (const key of Object.keys(SYNC_TABLES)) {
      if (key === "photos") continue;
      const rows = await listRowsForPush(key, pushSince);
      if (rows.length === 0) continue;
      await apiFetch("/sync/push", { method: "POST", body: { [key]: rows }, token });
      pushed += rows.length;
    }
  } catch (e: any) {
    throw new ApiError(`Falha ao enviar dados: ${e?.message || e}`, e?.status ?? 0);
  }

  // O projeto e suas parcelas/árvores JÁ estão no servidor. Registra aqui,
  // antes das fotos: um falha no upload de imagem não pode deixar o projeto
  // preso em "não enviado" (a janela de 24h reenvia as fotos na próxima rodada).
  await setSyncState(LAST_SYNC_KEY, String(Math.max(pushStartedAt, lastPush)));

  // 2) Push das fotos, em lotes pequenos para não montar um JSON gigante.
  try {
    const photoRows = await listRowsForPush("photos", pushSince);
    const PHOTO_BATCH = 6;
    for (let i = 0; i < photoRows.length; i += PHOTO_BATCH) {
      const batch = await photoRowsWithData(photoRows.slice(i, i + PHOTO_BATCH));
      await apiFetch("/sync/push", {
        method: "POST",
        body: { photos: batch },
        token,
        timeoutMs: 120000,
      });
      pushed += batch.length;
    }
  } catch (e: any) {
    throw new ApiError(`Falha ao enviar fotos: ${e?.message || e}`, e?.status ?? 0);
  }

  // 3) Pull: alterações remotas (snapshot completo se nunca baixou).
  // meta=1 evita baixar o conteúdo das fotos de uma vez; cada foto é buscada
  // sob demanda em /sync/photo/:uuid (servidor antigo ignora e devolve tudo).
  let pulled = 0;
  try {
    const since = first ? "" : `?since=${new Date(lastPull).toISOString()}`;
    const metaParam = `${since ? "&" : "?"}meta=1`;
    const pulledData = await apiFetch(`/sync/pull${since}${metaParam}`, {
      token,
      timeoutMs: 180000,
    });

    for (const key of Object.keys(SYNC_TABLES)) {
      const rows = pulledData[key] || [];
      if (rows.length === 0) continue;
      const skipped = await applyServerRows(
        key,
        rows,
        key === "photos" ? makePhotosTransform(token) : undefined
      );
      pulled += rows.length - skipped;
    }

    // Margem de 5min no relógio do servidor para não perder alterações.
    const serverNow = typeof pulledData.now === "number" ? pulledData.now : Date.now();
    const nextPull = Math.max(serverNow - 5 * 60 * 1000, lastPull);
    await setSyncState(LAST_PULL_KEY, String(nextPull));
  } catch (e: any) {
    throw new ApiError(`Falha ao baixar dados: ${e?.message || e}`, e?.status ?? 0);
  }

  return { pushed, pulled, first };
}
