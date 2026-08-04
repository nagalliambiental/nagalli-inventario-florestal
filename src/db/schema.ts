// Schema do banco local (cache offline).
// Chaves: uuid (texto) para sincronizar entre aparelhos.
// created_at/updated_at/deleted_at: epoch em milissegundos (INTEGER).
// deleted_at = 0 significa "não excluído" (tombstone).

export const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS projects (
  uuid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT 'censo',
  area_ha REAL NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS plots (
  uuid TEXT PRIMARY KEY,
  project_uuid TEXT NOT NULL REFERENCES projects(uuid) ON DELETE CASCADE,
  code TEXT NOT NULL,
  area_m2 REAL NOT NULL DEFAULT 0,
  shape TEXT NOT NULL DEFAULT '',
  coordinates TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS trees (
  uuid TEXT PRIMARY KEY,
  plot_uuid TEXT NOT NULL REFERENCES plots(uuid) ON DELETE CASCADE,
  number INTEGER NOT NULL DEFAULT 0,
  species_id INTEGER REFERENCES species(id),
  species_name TEXT NOT NULL DEFAULT '',
  is_tree INTEGER NOT NULL DEFAULT 1,
  cap_cm REAL NOT NULL DEFAULT 0,
  height_comercial_m REAL NOT NULL DEFAULT 0,
  height_total_m REAL NOT NULL DEFAULT 0,
  dbh_cm REAL NOT NULL DEFAULT 0,
  basal_area_m2 REAL NOT NULL DEFAULT 0,
  stem_count INTEGER NOT NULL DEFAULT 1,
  phytosanitary TEXT NOT NULL DEFAULT '',
  photo_uri TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  latitude REAL NOT NULL DEFAULT 0,
  longitude REAL NOT NULL DEFAULT 0,
  measured_at TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stems (
  uuid TEXT PRIMARY KEY,
  tree_uuid TEXT NOT NULL REFERENCES trees(uuid) ON DELETE CASCADE,
  number INTEGER NOT NULL DEFAULT 1,
  cap_cm REAL NOT NULL DEFAULT 0,
  height_comercial_m REAL NOT NULL DEFAULT 0,
  height_total_m REAL NOT NULL DEFAULT 0,
  dbh_cm REAL NOT NULL DEFAULT 0,
  basal_area_m2 REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tree_photos (
  uuid TEXT PRIMARY KEY,
  tree_uuid TEXT NOT NULL REFERENCES trees(uuid) ON DELETE CASCADE,
  uri TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS species (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  popular_name TEXT NOT NULL,
  scientific_name TEXT NOT NULL,
  family TEXT,
  phytophysiognomy TEXT,
  wood_density REAL DEFAULT 0,
  habito TEXT DEFAULT '',
  distribuicao TEXT DEFAULT '',
  endemismo TEXT DEFAULT '',
  status_conservacao TEXT DEFAULT '',
  crescimento TEXT DEFAULT '',
  vida_media TEXT DEFAULT '',
  amplitude_diametrica TEXT DEFAULT '',
  amplitude_altura TEXT DEFAULT '',
  epifitas TEXT DEFAULT '',
  lianas_herbaceas TEXT DEFAULT '',
  lianas_lenhosas TEXT DEFAULT '',
  gramineas TEXT DEFAULT '',
  regeneracao_dossel TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE INDEX IF NOT EXISTS idx_plots_project ON plots(project_uuid);
CREATE INDEX IF NOT EXISTS idx_trees_plot ON trees(plot_uuid);
CREATE INDEX IF NOT EXISTS idx_trees_species ON trees(species_id);
CREATE INDEX IF NOT EXISTS idx_stems_tree ON stems(tree_uuid);
CREATE INDEX IF NOT EXISTS idx_tree_photos_tree ON tree_photos(tree_uuid);
`;
