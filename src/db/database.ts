import * as SQLite from "expo-sqlite";
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

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  db = await SQLite.openDatabaseAsync("nagalli_inventario.db");
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.execAsync(CREATE_TABLES);
  await migrateDatabase(db);
  return db;
}

// Migra bancos criados por versões antigas (coluna única height_m e
// fustes sem altura) para o schema atual, sem perder os dados.
async function migrateDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  const tableColumns = async (table: string): Promise<Set<string>> => {
    const rows = await db.getAllAsync<any>(`PRAGMA table_info(${table})`);
    return new Set(rows.map((r) => r.name));
  };

  const treeCols = await tableColumns("trees");
  if (!treeCols.has("is_tree")) {
    await db.runAsync(
      "ALTER TABLE trees ADD COLUMN is_tree INTEGER DEFAULT 1"
    );
  }
  if (!treeCols.has("height_comercial_m")) {
    await db.runAsync(
      "ALTER TABLE trees ADD COLUMN height_comercial_m REAL DEFAULT 0"
    );
  }
  if (!treeCols.has("height_total_m")) {
    await db.runAsync(
      "ALTER TABLE trees ADD COLUMN height_total_m REAL DEFAULT 0"
    );
  }
  if (treeCols.has("height_m")) {
    await db.runAsync(
      `UPDATE trees SET height_total_m = height_m
       WHERE height_m IS NOT NULL AND height_total_m = 0`
    );
  }

  // Árvores de versões antigas podem estar com DAP/área basal nulos.
  // Backfill: DAP a partir do CAP e área basal a partir do DAP.
  await db.runAsync(
    `UPDATE trees SET dbh_cm = cap_cm / 3.141592653589793
     WHERE (dbh_cm IS NULL OR dbh_cm = 0) AND cap_cm > 0`
  );
  await db.runAsync(
    `UPDATE trees SET basal_area_m2 = (dbh_cm * dbh_cm) * 0.000078539816
     WHERE (basal_area_m2 IS NULL OR basal_area_m2 = 0) AND dbh_cm > 0`
  );

  const stemCols = await tableColumns("stems");
  if (!stemCols.has("height_comercial_m")) {
    await db.runAsync(
      "ALTER TABLE stems ADD COLUMN height_comercial_m REAL DEFAULT 0"
    );
  }
  if (!stemCols.has("height_total_m")) {
    await db.runAsync(
      "ALTER TABLE stems ADD COLUMN height_total_m REAL DEFAULT 0"
    );
  }

  const speciesCols = await tableColumns("species");
  const speciesTextCols: [string, string][] = [
    ["habito", "habito"],
    ["distribuicao", "distribuicao"],
    ["endemismo", "endemismo"],
    ["status_conservacao", "status_conservacao"],
    ["crescimento", "crescimento"],
    ["vida_media", "vida_media"],
    ["amplitude_diametrica", "amplitude_diametrica"],
    ["amplitude_altura", "amplitude_altura"],
    ["epifitas", "epifitas"],
    ["lianas_herbaceas", "lianas_herbaceas"],
    ["lianas_lenhosas", "lianas_lenhosas"],
    ["gramineas", "gramineas"],
    ["regeneracao_dossel", "regeneracao_dossel"],
  ];
  for (const [col] of speciesTextCols) {
    if (!speciesCols.has(col)) {
      await db.runAsync(`ALTER TABLE species ADD COLUMN ${col} TEXT DEFAULT ''`);
    }
  }

  // Indivíduos de espécies não arbóreas (erva, liana, arbusto...) não entram
  // nos relatórios florestais — apenas no levantamento florístico.
  // Executa depois dos ALTER TABLE acima para garantir a existência da coluna
  // habito em bancos criados por versões antigas.
  await db.runAsync(
    `UPDATE trees SET is_tree = 0
     WHERE species_id IN (
       SELECT id FROM species WHERE habito != '' AND habito != 'A - Arbórea'
     )`
  );
}

// ── Projects ──

export async function listProjects(): Promise<Project[]> {
  const rows = await db.getAllAsync<Project>(
    "SELECT * FROM projects ORDER BY updated_at DESC"
  );
  return rows.map(mapper.project);
}

export async function getProject(id: number): Promise<Project | null> {
  const row = await db.getFirstAsync<any>(
    "SELECT * FROM projects WHERE id = ?",
    [id]
  );
  return row ? mapper.project(row) : null;
}

export async function createProject(
  data: Omit<Project, "id" | "createdAt" | "updatedAt">
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO projects (name, client, location, method, area_ha)
     VALUES (?, ?, ?, ?, ?)`,
    [data.name, data.client, data.location, data.method, data.areaHa]
  );
  return result.lastInsertRowId;
}

export async function updateProject(
  id: number,
  data: Partial<Project>
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.client !== undefined) { fields.push("client = ?"); values.push(data.client); }
  if (data.location !== undefined) { fields.push("location = ?"); values.push(data.location); }
  if (data.method !== undefined) { fields.push("method = ?"); values.push(data.method); }
  if (data.areaHa !== undefined) { fields.push("area_ha = ?"); values.push(data.areaHa); }
  fields.push("updated_at = datetime('now','localtime')");
  values.push(id);
  await db.runAsync(
    `UPDATE projects SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteProject(id: number): Promise<void> {
  await db.runAsync("DELETE FROM projects WHERE id = ?", [id]);
}

// ── Plots ──

export async function listPlots(projectId: number): Promise<Plot[]> {
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM plots WHERE project_id = ? ORDER BY code",
    [projectId]
  );
  return rows.map(mapper.plot);
}

export async function createPlot(
  data: Omit<Plot, "id" | "createdAt">
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO plots (project_id, code, area_m2, shape, coordinates, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.projectId, data.code, data.areaM2, data.shape, data.coordinates, data.notes]
  );
  return result.lastInsertRowId;
}

export async function deletePlot(id: number): Promise<void> {
  await db.runAsync("DELETE FROM plots WHERE id = ?", [id]);
}

// ── Trees ──

export async function listTrees(plotId: number): Promise<Tree[]> {
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM trees WHERE plot_id = ? ORDER BY number",
    [plotId]
  );
  return Promise.all(rows.map(async (r) => mapper.tree(r)));
}

export async function getTree(id: number): Promise<Tree | null> {
  const row: any = await db.getFirstAsync(
    "SELECT * FROM trees WHERE id = ?",
    [id]
  );
  return row ? mapper.tree(row) : null;
}

export type TreePayload = Omit<Tree, "id" | "fustes" | "measuredAt" | "photos"> & {
  stems?: Omit<Stem, "id" | "treeId">[];
};

export async function createTree(data: TreePayload): Promise<number> {
  let treeId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO trees (plot_id, number, species_id, species_name, is_tree,
        cap_cm, height_comercial_m, height_total_m, dbh_cm, basal_area_m2, stem_count,
        phytosanitary, photo_uri, notes, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.plotId, data.number, data.speciesId, data.speciesName,
        data.isTree === false ? 0 : 1,
        data.capCm, data.heightComercialM, data.heightTotalM, data.dbhCm,
        data.basalAreaM2, data.stemCount,
        data.phytosanitary, data.photoUri, data.notes, data.latitude, data.longitude,
      ]
    );
    treeId = result.lastInsertRowId;
    if (data.stems && data.stems.length > 0) {
      await replaceStems(treeId, data.stems);
    }
  });
  return treeId;
}

export async function updateTree(
  id: number,
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
  values.push(id);

  await db.withTransactionAsync(async () => {
    if (fields.length > 0) {
      await db.runAsync(
        `UPDATE trees SET ${fields.join(", ")} WHERE id = ?`,
        values
      );
    }
    if (data.stems !== undefined) {
      await replaceStems(id, data.stems);
    }
  });
}

async function replaceStems(
  treeId: number,
  stems: Omit<Stem, "id" | "treeId">[]
): Promise<void> {
  await db.runAsync("DELETE FROM stems WHERE tree_id = ?", [treeId]);
  for (let i = 0; i < stems.length; i++) {
    const s = stems[i];
    await db.runAsync(
      `INSERT INTO stems (tree_id, number, cap_cm, height_comercial_m, height_total_m, dbh_cm, basal_area_m2)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        treeId,
        s.number || i + 1,
        s.capCm,
        s.heightComercialM,
        s.heightTotalM,
        s.dbhCm,
        s.basalAreaM2,
      ]
    );
  }
}

export async function deleteTree(id: number): Promise<void> {
  const photos = await listTreePhotos(id);
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM stems WHERE tree_id = ?", [id]);
    await db.runAsync("DELETE FROM tree_photos WHERE tree_id = ?", [id]);
    await db.runAsync("DELETE FROM trees WHERE id = ?", [id]);
  });
  for (const p of photos) {
    await deletePhotoFile(p.uri);
  }
}

// ── Stems ──

export async function listStems(treeId: number): Promise<Stem[]> {
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM stems WHERE tree_id = ? ORDER BY number",
    [treeId]
  );
  return rows.map(mapper.stem);
}

export async function createStem(
  data: Omit<Stem, "id">
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO stems (tree_id, number, cap_cm, height_comercial_m, height_total_m, dbh_cm, basal_area_m2)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.treeId, data.number, data.capCm, data.heightComercialM, data.heightTotalM, data.dbhCm, data.basalAreaM2]
  );
  return result.lastInsertRowId;
}

export async function deleteStemsByTree(treeId: number): Promise<void> {
  await db.runAsync("DELETE FROM stems WHERE tree_id = ?", [treeId]);
}

// ── Tree photos (anexos) ──

export async function listTreePhotos(treeId: number): Promise<TreePhoto[]> {
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM tree_photos WHERE tree_id = ? ORDER BY id",
    [treeId]
  );
  return rows.map(mapper.treePhoto);
}

export async function addTreePhoto(
  treeId: number,
  uri: string,
  caption = ""
): Promise<number> {
  const result = await db.runAsync(
    "INSERT INTO tree_photos (tree_id, uri, caption) VALUES (?, ?, ?)",
    [treeId, uri, caption]
  );
  return result.lastInsertRowId;
}

export async function deleteTreePhoto(id: number): Promise<void> {
  const rows = await db.getAllAsync<any>(
    "SELECT uri FROM tree_photos WHERE id = ?",
    [id]
  );
  await db.runAsync("DELETE FROM tree_photos WHERE id = ?", [id]);
  if (rows.length > 0) {
    await deletePhotoFile(rows[0].uri);
  }
}

// ── Species ──

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

// ── Configurações do app (ex.: PIN de acesso) ──

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

// ── Stats ──

export async function getProjectSummary(
  projectId: number
): Promise<ProjectSummary | null> {
  const proj = await getProject(projectId);
  if (!proj) return null;

  const plotCount = (
    await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM plots WHERE project_id = ?",
      [projectId]
    )
  )!.c;

  const treeRow = await db.getFirstAsync<any>(
    `SELECT COUNT(*) as tc, COALESCE(SUM(basal_area_m2),0) as ba
     FROM trees t JOIN plots p ON t.plot_id = p.id
     WHERE p.project_id = ? AND t.is_tree = 1`,
    [projectId]
  );

  const speciesCount = (
    await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(DISTINCT t.species_id) as c
       FROM trees t JOIN plots p ON t.plot_id = p.id
       WHERE p.project_id = ? AND t.is_tree = 1 AND t.species_id IS NOT NULL`,
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
    id: r.id,
    name: r.name,
    client: r.client,
    location: r.location,
    method: r.method,
    areaHa: r.area_ha,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }),
  plot: (r: any): Plot => ({
    id: r.id,
    projectId: r.project_id,
    code: r.code,
    areaM2: r.area_m2,
    shape: r.shape,
    coordinates: r.coordinates,
    notes: r.notes,
    createdAt: r.created_at,
  }),
  tree: async (r: any): Promise<Tree> => ({
    id: r.id,
    plotId: r.plot_id,
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
    fustes: await listStems(r.id),
    photos: await listTreePhotos(r.id),
  }),
  stem: (r: any): Stem => ({
    id: r.id,
    treeId: r.tree_id,
    number: r.number,
    capCm: r.cap_cm ?? 0,
    heightComercialM: r.height_comercial_m ?? 0,
    heightTotalM: r.height_total_m ?? 0,
    dbhCm: r.dbh_cm ?? 0,
    basalAreaM2: r.basal_area_m2 ?? 0,
  }),
  treePhoto: (r: any): TreePhoto => ({
    id: r.id,
    treeId: r.tree_id,
    uri: r.uri,
    caption: r.caption ?? "",
    createdAt: r.created_at,
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
