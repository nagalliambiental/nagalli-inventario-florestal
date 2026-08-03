export const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  client TEXT,
  location TEXT,
  method TEXT NOT NULL DEFAULT 'parcelas_fixas',
  area_ha REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS plots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  area_m2 REAL DEFAULT 0,
  shape TEXT,
  coordinates TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS trees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plot_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  species_id INTEGER,
  species_name TEXT,
  is_tree INTEGER DEFAULT 1,
  cap_cm REAL NOT NULL DEFAULT 0,
  height_comercial_m REAL DEFAULT 0,
  height_total_m REAL DEFAULT 0,
  dbh_cm REAL DEFAULT 0,
  basal_area_m2 REAL DEFAULT 0,
  stem_count INTEGER DEFAULT 1,
  phytosanitary TEXT,
  photo_uri TEXT,
  notes TEXT,
  latitude REAL,
  longitude REAL,
  measured_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS stems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id INTEGER NOT NULL,
  number INTEGER NOT NULL DEFAULT 1,
  cap_cm REAL NOT NULL DEFAULT 0,
  height_comercial_m REAL DEFAULT 0,
  height_total_m REAL DEFAULT 0,
  dbh_cm REAL DEFAULT 0,
  basal_area_m2 REAL DEFAULT 0,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS tree_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id INTEGER NOT NULL,
  uri TEXT NOT NULL,
  caption TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE
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
CREATE INDEX IF NOT EXISTS idx_plots_project ON plots(project_id);
CREATE INDEX IF NOT EXISTS idx_trees_plot ON trees(plot_id);
CREATE INDEX IF NOT EXISTS idx_trees_species ON trees(species_id);
CREATE INDEX IF NOT EXISTS idx_stems_tree ON stems(tree_id);
CREATE INDEX IF NOT EXISTS idx_tree_photos_tree ON tree_photos(tree_id);
`;