-- Esquema do banco central (Neon Postgres).
-- Todas as tabelas usam uuid (texto) como chave para permitir sincronizacao
-- entre varios aparelhos. deleted_at marca exclusao (tombstone) para sync.

CREATE TABLE IF NOT EXISTS users (
  uuid TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'worker' CHECK (role IN ('admin', 'worker')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  uuid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT 'censo',
  area_ha REAL NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Migração para tabelas já existentes (adiciona created_by sem apagar dados).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS plots (
  uuid TEXT PRIMARY KEY,
  project_uuid TEXT NOT NULL REFERENCES projects(uuid) ON DELETE CASCADE,
  code TEXT NOT NULL,
  area_m2 REAL NOT NULL DEFAULT 0,
  shape TEXT NOT NULL DEFAULT '',
  coordinates TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trees (
  uuid TEXT PRIMARY KEY,
  plot_uuid TEXT NOT NULL REFERENCES plots(uuid) ON DELETE CASCADE,
  number INTEGER NOT NULL DEFAULT 0,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tree_photos (
  uuid TEXT PRIMARY KEY,
  tree_uuid TEXT NOT NULL REFERENCES trees(uuid) ON DELETE CASCADE,
  uri TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Catálogo de espécies compartilhado entre aparelhos (sincronizado).
CREATE TABLE IF NOT EXISTS species (
  uuid TEXT PRIMARY KEY,
  popular_name TEXT NOT NULL DEFAULT '',
  scientific_name TEXT NOT NULL DEFAULT '',
  family TEXT NOT NULL DEFAULT '',
  phytophysiognomy TEXT NOT NULL DEFAULT '',
  wood_density REAL NOT NULL DEFAULT 0,
  habito TEXT NOT NULL DEFAULT '',
  distribuicao TEXT NOT NULL DEFAULT '',
  endemismo TEXT NOT NULL DEFAULT '',
  status_conservacao TEXT NOT NULL DEFAULT '',
  crescimento TEXT NOT NULL DEFAULT '',
  vida_media TEXT NOT NULL DEFAULT '',
  amplitude_diametrica TEXT NOT NULL DEFAULT '',
  amplitude_altura TEXT NOT NULL DEFAULT '',
  epifitas TEXT NOT NULL DEFAULT '',
  lianas_herbaceas TEXT NOT NULL DEFAULT '',
  lianas_lenhosas TEXT NOT NULL DEFAULT '',
  gramineas TEXT NOT NULL DEFAULT '',
  regeneracao_dossel TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_plots_project ON plots(project_uuid);
CREATE INDEX IF NOT EXISTS idx_trees_plot ON trees(plot_uuid);
CREATE INDEX IF NOT EXISTS idx_stems_tree ON stems(tree_uuid);
CREATE INDEX IF NOT EXISTS idx_photos_tree ON tree_photos(tree_uuid);
CREATE INDEX IF NOT EXISTS idx_sync_projects ON projects(updated_at);
CREATE INDEX IF NOT EXISTS idx_sync_plots ON plots(updated_at);
CREATE INDEX IF NOT EXISTS idx_sync_trees ON trees(updated_at);
CREATE INDEX IF NOT EXISTS idx_sync_stems ON stems(updated_at);
CREATE INDEX IF NOT EXISTS idx_sync_photos ON tree_photos(updated_at);
CREATE INDEX IF NOT EXISTS idx_sync_species ON species(updated_at);
