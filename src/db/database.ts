import * as SQLite from "expo-sqlite";
import { CREATE_TABLES } from "./schema";
import type {
  Project,
  Plot,
  Tree,
  Stem,
  Species,
  ProjectSummary,
} from "../types";

let db: SQLite.SQLiteDatabase;

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  db = await SQLite.openDatabaseAsync("nagalli_inventario.db");
  await db.execAsync(CREATE_TABLES);
  return db;
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

export async function createTree(
  data: Omit<Tree, "id" | "fustes" | "measuredAt">
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO trees (plot_id, number, species_id, species_name,
      cap_cm, height_m, dbh_cm, basal_area_m2, stem_count,
      phytosanitary, photo_uri, notes, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.plotId, data.number, data.speciesId, data.speciesName,
      data.capCm, data.heightM, data.dbhCm, data.basalAreaM2, data.stemCount,
      data.phytosanitary, data.photoUri, data.notes, data.latitude, data.longitude,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateTree(
  id: number,
  data: Partial<Tree>
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (data.number !== undefined) { fields.push("number = ?"); values.push(data.number); }
  if (data.speciesId !== undefined) { fields.push("species_id = ?"); values.push(data.speciesId); }
  if (data.speciesName !== undefined) { fields.push("species_name = ?"); values.push(data.speciesName); }
  if (data.capCm !== undefined) { fields.push("cap_cm = ?"); values.push(data.capCm); }
  if (data.heightM !== undefined) { fields.push("height_m = ?"); values.push(data.heightM); }
  if (data.dbhCm !== undefined) { fields.push("dbh_cm = ?"); values.push(data.dbhCm); }
  if (data.basalAreaM2 !== undefined) { fields.push("basal_area_m2 = ?"); values.push(data.basalAreaM2); }
  if (data.stemCount !== undefined) { fields.push("stem_count = ?"); values.push(data.stemCount); }
  if (data.phytosanitary !== undefined) { fields.push("phytosanitary = ?"); values.push(data.phytosanitary); }
  if (data.notes !== undefined) { fields.push("notes = ?"); values.push(data.notes); }
  values.push(id);
  await db.runAsync(
    `UPDATE trees SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteTree(id: number): Promise<void> {
  await db.runAsync("DELETE FROM trees WHERE id = ?", [id]);
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
    `INSERT INTO stems (tree_id, number, cap_cm, dbh_cm, basal_area_m2)
     VALUES (?, ?, ?, ?, ?)`,
    [data.treeId, data.number, data.capCm, data.dbhCm, data.basalAreaM2]
  );
  return result.lastInsertRowId;
}

export async function deleteStemsByTree(treeId: number): Promise<void> {
  await db.runAsync("DELETE FROM stems WHERE tree_id = ?", [treeId]);
}

// ── Species ──

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

export async function insertSpecies(
  data: Omit<Species, "id">
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO species (popular_name, scientific_name, family, phytophysiognomy, wood_density)
     VALUES (?, ?, ?, ?, ?)`,
    [data.popularName, data.scientificName, data.family, data.phytophysiognomy, data.woodDensity]
  );
  return result.lastInsertRowId;
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
     WHERE p.project_id = ?`,
    [projectId]
  );

  const speciesCount = (
    await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(DISTINCT t.species_id) as c
       FROM trees t JOIN plots p ON t.plot_id = p.id
       WHERE p.project_id = ? AND t.species_id IS NOT NULL`,
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
    capCm: r.cap_cm,
    heightM: r.height_m,
    dbhCm: r.dbh_cm,
    basalAreaM2: r.basal_area_m2,
    stemCount: r.stem_count,
    phytosanitary: r.phytosanitary,
    photoUri: r.photo_uri,
    notes: r.notes,
    latitude: r.latitude,
    longitude: r.longitude,
    measuredAt: r.measured_at,
    fustes: await listStems(r.id),
  }),
  stem: (r: any): Stem => ({
    id: r.id,
    treeId: r.tree_id,
    number: r.number,
    capCm: r.cap_cm,
    dbhCm: r.dbh_cm,
    basalAreaM2: r.basal_area_m2,
  }),
  species: (r: any): Species => ({
    id: r.id,
    popularName: r.popular_name,
    scientificName: r.scientific_name,
    family: r.family,
    phytophysiognomy: r.phytophysiognomy,
    woodDensity: r.wood_density,
  }),
};
