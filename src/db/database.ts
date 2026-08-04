import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import { CREATE_TABLES } from "./schema";
import { deletePhotoFile } from "../utils/photos";
import type {
  Project,
  Plot,
  Tree,
  Stem,
  Species,
  TreePhoto,
  ProjectSummary,
} from "../types";

let db: SQLite.SQLiteDatabase;

const now = () => Date.now();

export function newId(): string {
  return Crypto.randomUUID();
}

// ── Tabelas e colunas (para sync genérico) ──

export const SYNC_TABLES: Record<string, string[]> = {
  projects: ["uuid", "name", "client", "location", "method", "area_ha", "created_by", "created_at", "updated_at", "deleted_at"],
  plots: ["uuid", "project_uuid", "code", "area_m2", "shape", "coordinates", "notes", "created_at", "updated_at", "deleted_at"],
  trees: ["uuid", "plot_uuid", "number", "species_id", "species_name", "is_tree", "cap_cm", "height_comercial_m", "height_total_m", "dbh_cm", "basal_area_m2", "stem_count", "phytosanitary", "photo_uri", "notes", "latitude", "longitude", "measured_at", "created_at", "updated_at", "deleted_at"],
  stems: ["uuid", "tree_uuid", "number", "cap_cm", "height_comercial_m", "height_total_m", "dbh_cm", "basal_area_m2", "created_at", "updated_at", "deleted_at"],
  photos: ["uuid", "tree_uuid", "uri", "caption", "created_at", "updated_at", "deleted_at"],
};

// Nome da tabela local para cada chave de sincronização. As fotos ficam em
// "tree_photos" no banco local (o servidor chama de "photos").
export const LOCAL_TABLES: Record<string, string> = {
  projects: "projects",
  plots: "plots",
  trees: "trees",
  stems: "stems",
  photos: "tree_photos",
};

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  db = await SQLite.openDatabaseAsync("nagalli_v2.db");
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.execAsync(CREATE_TABLES);
  await ensureProjectColumns();
  await migrateFromLegacy();
  return db;
}

// Migração de schema para bancos já existentes: garante a coluna created_by.
async function ensureProjectColumns(): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(projects)");
  if (!cols.some((c) => c.name === "created_by")) {
    await db.execAsync(
      "ALTER TABLE projects ADD COLUMN created_by TEXT NOT NULL DEFAULT ''"
    );
  }
}

// Migração única do banco antigo (ids inteiros) para o novo (uuids).
async function migrateFromLegacy(): Promise<void> {
  const legacyPath = FileSystem.documentDirectory + "nagalli_inventario.db";
  const exists = await FileSystem.getInfoAsync(legacyPath).catch(() => null);
  if (!exists || !exists.exists) return;
  try {
    const legacy = await SQLite.openDatabaseAsync("nagalli_inventario.db");
    const tableExists = async (name: string): Promise<boolean> => {
      const r = await legacy.getFirstAsync<{ n: number }>(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?",
        [name]
      );
      return (r?.n ?? 0) > 0;
    };
    if (!(await tableExists("projects"))) return;

    const toMs = (v: any): number => {
      if (!v) return now();
      if (typeof v === "number") return v;
      const d = new Date(String(v).replace(" ", "T"));
      return isNaN(d.getTime()) ? now() : d.getTime();
    };

    // Espécies (mesmas ids inteiras)
    const species = await legacy.getAllAsync<any>("SELECT * FROM species");
    for (const s of species) {
      await db.runAsync(
        `INSERT OR IGNORE INTO species (id, popular_name, scientific_name, family, phytophysiognomy, wood_density,
          habito, distribuicao, endemismo, status_conservacao, crescimento, vida_media,
          amplitude_diametrica, amplitude_altura, epifitas, lianas_herbaceas, lianas_lenhosas, gramineas, regeneracao_dossel)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.popular_name, s.scientific_name, s.family, s.phytophysiognomy, s.wood_density,
          s.habito || "", s.distribuicao || "", s.endemismo || "", s.status_conservacao || "",
          s.crescimento || "", s.vida_media || "", s.amplitude_diametrica || "", s.amplitude_altura || "",
          s.epifitas || "", s.lianas_herbaceas || "", s.lianas_lenhosas || "", s.gramineas || "", s.regeneracao_dossel || ""]
      );
    }

    const projects = await legacy.getAllAsync<any>("SELECT * FROM projects");
    const projectUuid = new Map<number, string>();
    for (const p of projects) {
      const id = newId();
      projectUuid.set(p.id, id);
      await db.runAsync(
        `INSERT INTO projects (uuid, name, client, location, method, area_ha, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [id, p.name, p.client || "", p.location || "", p.method || "censo", p.area_ha || 0, toMs(p.created_at), toMs(p.updated_at)]
      );
    }

    const plots = await legacy.getAllAsync<any>("SELECT * FROM plots");
    const plotUuid = new Map<number, string>();
    for (const pl of plots) {
      const id = newId();
      plotUuid.set(pl.id, id);
      const pu = projectUuid.get(pl.project_id);
      if (!pu) continue;
      await db.runAsync(
        `INSERT INTO plots (uuid, project_uuid, code, area_m2, shape, coordinates, notes, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [id, pu, pl.code, pl.area_m2 || 0, pl.shape || "", pl.coordinates || "", pl.notes || "", toMs(pl.created_at), toMs(pl.created_at)]
      );
    }

    const trees = await legacy.getAllAsync<any>("SELECT * FROM trees");
    const treeUuid = new Map<number, string>();
    for (const t of trees) {
      const id = newId();
      treeUuid.set(t.id, id);
      const plu = plotUuid.get(t.plot_id);
      if (!plu) continue;
      await db.runAsync(
        `INSERT INTO trees (uuid, plot_uuid, number, species_id, species_name, is_tree, cap_cm, height_comercial_m,
          height_total_m, dbh_cm, basal_area_m2, stem_count, phytosanitary, photo_uri, notes, latitude, longitude,
          measured_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [id, plu, t.number || 0, t.species_id, t.species_name || "", t.is_tree ?? 1, t.cap_cm || 0,
          t.height_comercial_m || 0, t.height_total_m || 0, t.dbh_cm || 0, t.basal_area_m2 || 0,
          t.stem_count || 1, t.phytosanitary || "", t.photo_uri || "", t.notes || "", t.latitude || 0,
          t.longitude || 0, t.measured_at || "", toMs(t.measured_at), toMs(t.measured_at)]
      );
    }

    const stems = await legacy.getAllAsync<any>("SELECT * FROM stems");
    for (const s of stems) {
      const tu = treeUuid.get(s.tree_id);
      if (!tu) continue;
      await db.runAsync(
        `INSERT INTO stems (uuid, tree_uuid, number, cap_cm, height_comercial_m, height_total_m, dbh_cm, basal_area_m2, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [newId(), tu, s.number || 1, s.cap_cm || 0, s.height_comercial_m || 0, s.height_total_m || 0, s.dbh_cm || 0, s.basal_area_m2 || 0, toMs(s.created_at), toMs(s.created_at)]
      );
    }

    const photos = await legacy.getAllAsync<any>("SELECT * FROM tree_photos");
    for (const ph of photos) {
      const tu = treeUuid.get(ph.tree_id);
      if (!tu) continue;
      await db.runAsync(
        `INSERT INTO tree_photos (uuid, tree_uuid, uri, caption, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [newId(), tu, ph.uri || "", ph.caption || "", toMs(ph.created_at), toMs(ph.created_at)]
      );
    }

    await legacy.closeAsync().catch(() => {});
    await FileSystem.deleteAsync(legacyPath, { idempotent: true }).catch(() => {});
  } catch (e) {
    console.warn("Migração legada ignorada:", e);
  }
}

// ── Projects ──

export async function listProjects(): Promise<Project[]> {
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM projects WHERE deleted_at = 0 ORDER BY updated_at DESC"
  );
  return rows.map(mapper.project);
}

export async function getProject(id: string): Promise<Project | null> {
  const row = await db.getFirstAsync<any>(
    "SELECT * FROM projects WHERE uuid = ? AND deleted_at = 0",
    [id]
  );
  return row ? mapper.project(row) : null;
}

export async function createProject(
  data: Omit<Project, "id" | "createdAt" | "updatedAt" | "deletedAt">
): Promise<string> {
  const id = newId();
  const t = now();
  await db.runAsync(
    `INSERT INTO projects (uuid, name, client, location, method, area_ha, created_by, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, data.name, data.client || "", data.location || "", data.method, data.areaHa || 0, data.createdBy || "", t, t]
  );
  return id;
}

export async function updateProject(
  id: string,
  data: Partial<Project>
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.client !== undefined) { fields.push("client = ?"); values.push(data.client); }
  if (data.location !== undefined) { fields.push("location = ?"); values.push(data.location); }
  if (data.method !== undefined) { fields.push("method = ?"); values.push(data.method); }
  if (data.areaHa !== undefined) { fields.push("area_ha = ?"); values.push(data.areaHa); }
  fields.push("updated_at = ?");
  values.push(now());
  values.push(id);
  await db.runAsync(`UPDATE projects SET ${fields.join(", ")} WHERE uuid = ?`, values);
}

export async function deleteProject(id: string): Promise<void> {
  const t = now();
  await db.withTransactionAsync(async () => {
    const plots = await db.getAllAsync<{ uuid: string }>(
      "SELECT uuid FROM plots WHERE project_uuid = ?",
      [id]
    );
    for (const p of plots) {
      const trees = await db.getAllAsync<{ uuid: string }>(
        "SELECT uuid FROM trees WHERE plot_uuid = ?",
        [p.uuid]
      );
      for (const tr of trees) {
        await db.runAsync("UPDATE stems SET deleted_at = ? WHERE tree_uuid = ?", [t, tr.uuid]);
        await db.runAsync("UPDATE tree_photos SET deleted_at = ? WHERE tree_uuid = ?", [t, tr.uuid]);
        await db.runAsync("UPDATE trees SET deleted_at = ?, updated_at = ? WHERE uuid = ?", [t, t, tr.uuid]);
      }
      await db.runAsync("UPDATE plots SET deleted_at = ?, updated_at = ? WHERE uuid = ?", [t, t, p.uuid]);
    }
    await db.runAsync("UPDATE projects SET deleted_at = ?, updated_at = ? WHERE uuid = ?", [t, t, id]);
  });
}

// ── Plots ──

export async function listPlots(projectId: string): Promise<Plot[]> {
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM plots WHERE project_uuid = ? AND deleted_at = 0 ORDER BY code",
    [projectId]
  );
  return rows.map(mapper.plot);
}

export async function createPlot(
  data: Omit<Plot, "id" | "createdAt" | "updatedAt" | "deletedAt">
): Promise<string> {
  const id = newId();
  const t = now();
  await db.runAsync(
    `INSERT INTO plots (uuid, project_uuid, code, area_m2, shape, coordinates, notes, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, data.projectId, data.code, data.areaM2 || 0, data.shape || "", data.coordinates || "", data.notes || "", t, t]
  );
  return id;
}

export async function deletePlot(id: string): Promise<void> {
  const t = now();
  await db.withTransactionAsync(async () => {
    const trees = await db.getAllAsync<{ uuid: string }>(
      "SELECT uuid FROM trees WHERE plot_uuid = ?",
      [id]
    );
    for (const tr of trees) {
      await db.runAsync("UPDATE stems SET deleted_at = ? WHERE tree_uuid = ?", [t, tr.uuid]);
      await db.runAsync("UPDATE tree_photos SET deleted_at = ? WHERE tree_uuid = ?", [t, tr.uuid]);
      await db.runAsync("UPDATE trees SET deleted_at = ?, updated_at = ? WHERE uuid = ?", [t, t, tr.uuid]);
    }
    await db.runAsync("UPDATE plots SET deleted_at = ?, updated_at = ? WHERE uuid = ?", [t, t, id]);
  });
}

// ── Trees ──

export async function listTrees(plotId: string): Promise<Tree[]> {
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM trees WHERE plot_uuid = ? AND deleted_at = 0 ORDER BY number",
    [plotId]
  );
  return Promise.all(rows.map(async (r) => mapper.tree(r)));
}

export async function getTree(id: string): Promise<Tree | null> {
  const row: any = await db.getFirstAsync(
    "SELECT * FROM trees WHERE uuid = ? AND deleted_at = 0",
    [id]
  );
  return row ? mapper.tree(row) : null;
}

export type TreePayload = Omit<Tree, "id" | "fustes" | "measuredAt" | "photos" | "createdAt" | "updatedAt" | "deletedAt"> & {
  stems?: Omit<Stem, "id" | "treeId" | "createdAt" | "updatedAt" | "deletedAt">[];
};

export async function createTree(data: TreePayload): Promise<string> {
  const id = newId();
  const t = now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO trees (uuid, plot_uuid, number, species_id, species_name, is_tree,
        cap_cm, height_comercial_m, height_total_m, dbh_cm, basal_area_m2, stem_count,
        phytosanitary, photo_uri, notes, latitude, longitude, measured_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id, data.plotId, data.number, data.speciesId, data.speciesName,
        data.isTree === false ? 0 : 1,
        data.capCm, data.heightComercialM, data.heightTotalM, data.dbhCm,
        data.basalAreaM2, data.stemCount,
        data.phytosanitary, data.photoUri, data.notes, data.latitude, data.longitude,
        "", t, t,
      ]
    );
    if (data.stems && data.stems.length > 0) {
      for (const s of data.stems) {
        await db.runAsync(
          `INSERT INTO stems (uuid, tree_uuid, number, cap_cm, height_comercial_m, height_total_m, dbh_cm, basal_area_m2, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [newId(), id, s.number || 1, s.capCm, s.heightComercialM, s.heightTotalM, s.dbhCm, s.basalAreaM2, t, t]
        );
      }
    }
  });
  return id;
}

export async function updateTree(
  id: string,
  data: Partial<TreePayload>
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (data.number !== undefined) { fields.push("number = ?"); values.push(data.number); }
  if (data.speciesId !== undefined) { fields.push("species_id = ?"); values.push(data.speciesId); }
  if (data.speciesName !== undefined) { fields.push("species_name = ?"); values.push(data.speciesName); }
  if (data.isTree !== undefined) { fields.push("is_tree = ?"); values.push(data.isTree ? 1 : 0); }
  if (data.capCm !== undefined) { fields.push("cap_cm = ?"); values.push(data.capCm); }
  if (data.heightComercialM !== undefined) { fields.push("height_comercial_m = ?"); values.push(data.heightComercialM); }
  if (data.heightTotalM !== undefined) { fields.push("height_total_m = ?"); values.push(data.heightTotalM); }
  if (data.dbhCm !== undefined) { fields.push("dbh_cm = ?"); values.push(data.dbhCm); }
  if (data.basalAreaM2 !== undefined) { fields.push("basal_area_m2 = ?"); values.push(data.basalAreaM2); }
  if (data.stemCount !== undefined) { fields.push("stem_count = ?"); values.push(data.stemCount); }
  if (data.phytosanitary !== undefined) { fields.push("phytosanitary = ?"); values.push(data.phytosanitary); }
  if (data.photoUri !== undefined) { fields.push("photo_uri = ?"); values.push(data.photoUri); }
  if (data.notes !== undefined) { fields.push("notes = ?"); values.push(data.notes); }
  if (data.latitude !== undefined) { fields.push("latitude = ?"); values.push(data.latitude); }
  if (data.longitude !== undefined) { fields.push("longitude = ?"); values.push(data.longitude); }
  fields.push("updated_at = ?");
  values.push(now());
  values.push(id);

  await db.withTransactionAsync(async () => {
    if (fields.length > 0) {
      await db.runAsync(`UPDATE trees SET ${fields.join(", ")} WHERE uuid = ?`, values);
    }
    if (data.stems !== undefined) {
      // Substituição: exclui (soft) os fustes antigos e insere os novos.
      const t = now();
      await db.runAsync("UPDATE stems SET deleted_at = ?, updated_at = ? WHERE tree_uuid = ?", [t, t, id]);
      for (const s of data.stems) {
        await db.runAsync(
          `INSERT INTO stems (uuid, tree_uuid, number, cap_cm, height_comercial_m, height_total_m, dbh_cm, basal_area_m2, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [newId(), id, s.number || 1, s.capCm, s.heightComercialM, s.heightTotalM, s.dbhCm, s.basalAreaM2, t, t]
        );
      }
    }
  });
}

export async function deleteTree(id: string): Promise<void> {
  const photos = await listTreePhotos(id);
  const t = now();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE stems SET deleted_at = ?, updated_at = ? WHERE tree_uuid = ?", [t, t, id]);
    await db.runAsync("UPDATE tree_photos SET deleted_at = ?, updated_at = ? WHERE tree_uuid = ?", [t, t, id]);
    await db.runAsync("UPDATE trees SET deleted_at = ?, updated_at = ? WHERE uuid = ?", [t, t, id]);
  });
  for (const p of photos) {
    await deletePhotoFile(p.uri);
  }
}

// ── Stems ──

export async function listStems(treeId: string): Promise<Stem[]> {
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM stems WHERE tree_uuid = ? AND deleted_at = 0 ORDER BY number",
    [treeId]
  );
  return rows.map(mapper.stem);
}

export async function createStem(
  data: Omit<Stem, "id" | "createdAt" | "updatedAt" | "deletedAt">
): Promise<string> {
  const id = newId();
  const t = now();
  await db.runAsync(
    `INSERT INTO stems (uuid, tree_uuid, number, cap_cm, height_comercial_m, height_total_m, dbh_cm, basal_area_m2, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, data.treeId, data.number, data.capCm, data.heightComercialM, data.heightTotalM, data.dbhCm, data.basalAreaM2, t, t]
  );
  return id;
}

export async function deleteStemsByTree(treeId: string): Promise<void> {
  const t = now();
  await db.runAsync("UPDATE stems SET deleted_at = ?, updated_at = ? WHERE tree_uuid = ?", [t, t, treeId]);
}

// ── Tree photos (anexos) ──

export async function listTreePhotos(treeId: string): Promise<TreePhoto[]> {
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM tree_photos WHERE tree_uuid = ? AND deleted_at = 0 ORDER BY created_at",
    [treeId]
  );
  return rows.map(mapper.treePhoto);
}

export async function getTreePhoto(uuid: string): Promise<TreePhoto | null> {
  const row = await db.getFirstAsync<any>(
    "SELECT * FROM tree_photos WHERE uuid = ?",
    [uuid]
  );
  return row ? mapper.treePhoto(row) : null;
}

export async function addTreePhoto(
  treeId: string,
  uri: string,
  caption = ""
): Promise<string> {
  const id = newId();
  const t = now();
  await db.runAsync(
    `INSERT INTO tree_photos (uuid, tree_uuid, uri, caption, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [id, treeId, uri, caption, t, t]
  );
  return id;
}

export async function deleteTreePhoto(id: string): Promise<void> {
  const rows = await db.getAllAsync<any>(
    "SELECT uri FROM tree_photos WHERE uuid = ?",
    [id]
  );
  const t = now();
  await db.runAsync("UPDATE tree_photos SET deleted_at = ?, updated_at = ? WHERE uuid = ?", [t, t, id]);
  if (rows.length > 0) {
    await deletePhotoFile(rows[0].uri);
  }
}

// ── Species (catálogo local, não sincronizado) ──

export async function listSpecies(): Promise<Species[]> {
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM species ORDER BY scientific_name"
  );
  return rows.map(mapper.species);
}

export async function listSpeciesByPhyto(
  phytophysiognomy?: string
): Promise<Species[]> {
  const rows = await db.getAllAsync<any>(
    phytophysiognomy
      ? "SELECT * FROM species WHERE phytophysiognomy = ? ORDER BY popular_name"
      : "SELECT * FROM species ORDER BY popular_name",
    phytophysiognomy ? [phytophysiognomy] : []
  );
  return rows.map(mapper.species);
}

export async function getSpecies(id: number): Promise<Species | null> {
  const row = await db.getFirstAsync<any>(
    "SELECT * FROM species WHERE id = ?",
    [id]
  );
  return row ? mapper.species(row) : null;
}

export async function insertSpecies(
  data: Omit<Species, "id">
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO species (popular_name, scientific_name, family, phytophysiognomy, wood_density,
      habito, distribuicao, endemismo, status_conservacao,
      crescimento, vida_media, amplitude_diametrica, amplitude_altura,
      epifitas, lianas_herbaceas, lianas_lenhosas, gramineas, regeneracao_dossel)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.popularName, data.scientificName, data.family, data.phytophysiognomy, data.woodDensity,
      data.habit, data.distribution, data.endemism, data.conservationStatus,
      data.growth, data.lifeSpan, data.dbhAmplitude, data.heightAmplitude,
      data.epiphytes, data.herbaceousLianas, data.woodyLianas, data.grasses, data.canopyRegeneration,
    ]
  );
  return result.lastInsertRowId;
}

export async function deleteSpecies(id: number): Promise<void> {
  await db.runAsync("DELETE FROM species WHERE id = ?", [id]);
}

// ── Configurações do app ──

export async function getConfig(key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_config WHERE key = ?",
    [key]
  );
  return row ? row.value : null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export async function deleteConfig(key: string): Promise<void> {
  await db.runAsync("DELETE FROM app_config WHERE key = ?", [key]);
}

// ── Estado da sincronização ──

export async function getSyncState(key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM sync_state WHERE key = ?",
    [key]
  );
  return row ? row.value : null;
}

export async function setSyncState(key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

// ── Sync: leitura de alterações locais e aplicação do servidor ──

// Lê as alterações locais de uma tabela (pela chave de sync) desde o último
// envio. Retorna linhas prontas para o /sync/push.
export async function listRowsForPush(syncKey: string, since: number): Promise<any[]> {
  const local = LOCAL_TABLES[syncKey];
  return db.getAllAsync<any>(
    `SELECT ${SYNC_TABLES[syncKey].join(", ")} FROM ${local} WHERE updated_at > ?`,
    [since]
  );
}

export async function listAllRows(syncKey: string): Promise<any[]> {
  const local = LOCAL_TABLES[syncKey];
  return db.getAllAsync<any>(
    `SELECT ${SYNC_TABLES[syncKey].join(", ")} FROM ${local}`
  );
}

// Aplica linhas vindas do servidor com resolução last-writer-wins.
export async function applyServerRows(
  syncKey: string,
  rows: any[],
  transform?: (r: any) => any | Promise<any>
): Promise<void> {
  if (!rows || rows.length === 0) return;
  const local = LOCAL_TABLES[syncKey];
  const cols = SYNC_TABLES[syncKey];
  const setCols = cols
    .filter((c) => c !== "uuid" && c !== "created_at")
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const sql = `INSERT INTO ${local} (${cols.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT (uuid) DO UPDATE SET ${setCols}
    WHERE excluded.updated_at >= ${local}.updated_at`;

  await db.withTransactionAsync(async () => {
    for (const r of rows) {
      const row = transform ? await transform(r) : r;
      const values = cols.map((c) => {
        const v = row[c];
        if (v === undefined || v === null) return c === "species_id" ? null : 0;
        return v;
      });
      await db.runAsync(sql, values);
    }
  });
}

// ── Stats ──

export async function getProjectSummary(
  projectId: string
): Promise<ProjectSummary | null> {
  const proj = await getProject(projectId);
  if (!proj) return null;

  const plotCount = (
    await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM plots WHERE project_uuid = ? AND deleted_at = 0",
      [projectId]
    )
  )!.c;

  const treeRow = await db.getFirstAsync<any>(
    `SELECT COUNT(*) as tc, COALESCE(SUM(basal_area_m2),0) as ba
     FROM trees t JOIN plots p ON t.plot_uuid = p.uuid
     WHERE p.project_uuid = ? AND t.is_tree = 1 AND t.deleted_at = 0 AND p.deleted_at = 0`,
    [projectId]
  );

  const speciesCount = (
    await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(DISTINCT t.species_id) as c
       FROM trees t JOIN plots p ON t.plot_uuid = p.uuid
       WHERE p.project_uuid = ? AND t.is_tree = 1 AND t.species_id IS NOT NULL
         AND t.deleted_at = 0 AND p.deleted_at = 0`,
      [projectId]
    )
  )!.c;

  return {
    project: proj,
    plotCount,
    treeCount: treeRow.tc,
    speciesCount,
    basalAreaTotal: treeRow.ba,
    volumeTotal: 0,
  };
}

// ── Mappers ──

const mapper = {
  project: (r: any): Project => ({
    id: r.uuid,
    name: r.name,
    client: r.client,
    location: r.location,
    method: r.method,
    areaHa: r.area_ha,
    createdBy: r.created_by || "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at || 0,
  }),
  plot: (r: any): Plot => ({
    id: r.uuid,
    projectId: r.project_uuid,
    code: r.code,
    areaM2: r.area_m2,
    shape: r.shape,
    coordinates: r.coordinates,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at || 0,
  }),
  tree: async (r: any): Promise<Tree> => ({
    id: r.uuid,
    plotId: r.plot_uuid,
    number: r.number,
    speciesId: r.species_id,
    speciesName: r.species_name,
    isTree: r.is_tree !== 0,
    capCm: r.cap_cm ?? 0,
    heightComercialM: r.height_comercial_m ?? 0,
    heightTotalM: r.height_total_m ?? 0,
    dbhCm: r.dbh_cm ?? 0,
    basalAreaM2: r.basal_area_m2 ?? 0,
    stemCount: r.stem_count ?? 1,
    phytosanitary: r.phytosanitary,
    photoUri: r.photo_uri,
    notes: r.notes,
    latitude: r.latitude,
    longitude: r.longitude,
    measuredAt: r.measured_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at || 0,
    fustes: await listStems(r.uuid),
    photos: await listTreePhotos(r.uuid),
  }),
  stem: (r: any): Stem => ({
    id: r.uuid,
    treeId: r.tree_uuid,
    number: r.number,
    capCm: r.cap_cm ?? 0,
    heightComercialM: r.height_comercial_m ?? 0,
    heightTotalM: r.height_total_m ?? 0,
    dbhCm: r.dbh_cm ?? 0,
    basalAreaM2: r.basal_area_m2 ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at || 0,
  }),
  treePhoto: (r: any): TreePhoto => ({
    id: r.uuid,
    treeId: r.tree_uuid,
    uri: r.uri,
    caption: r.caption ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at || 0,
  }),
  species: (r: any): Species => ({
    id: r.id,
    popularName: r.popular_name,
    scientificName: r.scientific_name,
    family: r.family,
    phytophysiognomy: r.phytophysiognomy,
    woodDensity: r.wood_density,
    habit: r.habito ?? "",
    distribution: r.distribuicao ?? "",
    endemism: r.endemismo ?? "",
    conservationStatus: r.status_conservacao ?? "",
    growth: r.crescimento ?? "",
    lifeSpan: r.vida_media ?? "",
    dbhAmplitude: r.amplitude_diametrica ?? "",
    heightAmplitude: r.amplitude_altura ?? "",
    epiphytes: r.epifitas ?? "",
    herbaceousLianas: r.lianas_herbaceas ?? "",
    woodyLianas: r.lianas_lenhosas ?? "",
    grasses: r.gramineas ?? "",
    canopyRegeneration: r.regeneracao_dossel ?? "",
  }),
};
