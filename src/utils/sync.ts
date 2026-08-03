import * as FileSystem from "expo-file-system";
import { apiFetch } from "../api/client";
import {
  SYNC_TABLES,
  listRowsForPush,
  applyServerRows,
  getSyncState,
  setSyncState,
  getTreePhoto,
} from "../db/database";
import { PHOTOS_DIR, deletePhotoFile } from "./photos";

const LAST_SYNC_KEY = "last_sync_at";

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
async function rowsForPush(key: string, lastSync: number): Promise<any[]> {
  const rows = await listRowsForPush(key, lastSync);
  if (key !== "photos") return rows;

  const out: any[] = [];
  for (const r of rows) {
    const { data: _data, ...rest } = r;
    let data = "";
    if (rest.uri) {
      try {
        data = await FileSystem.readAsStringAsync(rest.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch {}
    }
    out.push({ ...rest, data });
  }
  return out;
}

// Transforma as fotos vindas do servidor: grava o arquivo localmente e
// preserva/limpa o uri de acordo (caminho de arquivo local é específico do aparelho).
async function photosTransform(r: any): Promise<any> {
  const existing = await getTreePhoto(r.uuid);
  if (r.deleted_at > 0) {
    if (existing?.uri) await deletePhotoFile(existing.uri);
    return { ...r, uri: "", deleted_at: r.deleted_at ?? 0 };
  }
  if (r.data) {
    const uri = await writePhotoData(r.uuid, r.data);
    return { ...r, uri, deleted_at: r.deleted_at ?? 0 };
  }
  return { ...r, uri: existing?.uri || r.uri || "", deleted_at: r.deleted_at ?? 0 };
}

// Sincroniza este aparelho com a nuvem: envia as alterações locais e baixa as
// alterações dos outros aparelhos. Requer conexão com a internet.
export async function syncNow(token: string): Promise<SyncResult> {
  const lastSyncRaw = await getSyncState(LAST_SYNC_KEY);
  const lastSync = lastSyncRaw ? parseInt(lastSyncRaw, 10) : 0;
  const first = lastSync === 0;

  // 1) Push: alterações locais desde o último sync.
  const body: any = {};
  let pushed = 0;
  for (const key of Object.keys(SYNC_TABLES)) {
    const rows = await rowsForPush(key, lastSync);
    body[key] = rows;
    pushed += rows.length;
  }
  await apiFetch("/sync/push", { method: "POST", body, token });

  // 2) Pull: alterações remotas desde o último sync (snapshot completo se nunca sincronizou).
  const since = first ? "" : `?since=${new Date(lastSync).toISOString()}`;
  const pulledData = await apiFetch(`/sync/pull${since}`, { token });

  let pulled = 0;
  for (const key of Object.keys(SYNC_TABLES)) {
    const rows = pulledData[key] || [];
    if (rows.length === 0) continue;
    await applyServerRows(
      key,
      rows,
      key === "photos" ? photosTransform : undefined
    );
    pulled += rows.length;
  }

  // 3) Marca o momento do sync. Usa o relógio do servidor com uma margem de
  // segurança para não perder alterações locais em caso de diferença de relógio.
  const serverNow = typeof pulledData.now === "number" ? pulledData.now : Date.now();
  const nextLastSync = Math.max(serverNow - 5 * 60 * 1000, lastSync);
  await setSyncState(LAST_SYNC_KEY, String(nextLastSync));

  return { pushed, pulled, first };
}
