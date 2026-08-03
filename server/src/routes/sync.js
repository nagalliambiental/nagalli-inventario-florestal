import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

// O app trabalha com epoch em milissegundos (number). O banco usa timestamptz.
const TS_COLS = new Set(["created_at", "updated_at", "deleted_at"]);
const toDb = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return new Date(v).toISOString();
  return v;
};
const fromDb = (v) => {
  if (v === null || v === undefined) return null;
  const d = typeof v === "number" ? new Date(v) : new Date(v);
  return isNaN(d.getTime()) ? null : d.getTime();
};

// Upsert por linha com resolução "last-writer-wins" baseada em updated_at.
// Um registro com deleted_at preenchido é um tombstone (marca a exclusão).
async function upsert(syncKey, cols, records) {
  if (!Array.isArray(records) || records.length === 0) return 0;
  const table = TABLE_NAMES[syncKey];
  let count = 0;
  for (const r of records) {
    const values = cols.map((c) => (TS_COLS.has(c) ? toDb(r[c]) : r[c] ?? null));
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const setCols = cols
      .filter((c) => c !== "uuid" && c !== "created_at")
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(", ");
    const sql = `INSERT INTO ${table} (${cols.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT (uuid) DO UPDATE SET
        ${setCols}
      WHERE EXCLUDED.updated_at >= ${table}.updated_at`;
    const res = await pool.query(sql, values);
    count += res.rowCount ?? 0;
  }
  return count;
}

const TABLES = {
  projects: [
    "uuid", "name", "client", "location", "method", "area_ha",
    "created_at", "updated_at", "deleted_at",
  ],
  plots: [
    "uuid", "project_uuid", "code", "area_m2", "shape", "coordinates", "notes",
    "created_at", "updated_at", "deleted_at",
  ],
  trees: [
    "uuid", "plot_uuid", "number", "species_name", "is_tree", "cap_cm",
    "height_comercial_m", "height_total_m", "dbh_cm", "basal_area_m2",
    "stem_count", "phytosanitary", "photo_uri", "notes", "latitude", "longitude",
    "measured_at", "created_at", "updated_at", "deleted_at",
  ],
  stems: [
    "uuid", "tree_uuid", "number", "cap_cm", "height_comercial_m", "height_total_m",
    "dbh_cm", "basal_area_m2", "created_at", "updated_at", "deleted_at",
  ],
  photos: [
    "uuid", "tree_uuid", "uri", "caption", "data",
    "created_at", "updated_at", "deleted_at",
  ],
};

// Nome real da tabela no banco. As fotos ficam em "tree_photos" (a chave de
// sync continua "photos" por compatibilidade com o app).
const TABLE_NAMES = {
  projects: "projects",
  plots: "plots",
  trees: "trees",
  stems: "stems",
  photos: "tree_photos",
};

// POST /sync/push
// Envia as alterações locais do aparelho. Aceita arrays opcionais:
// { projects?, plots?, trees?, stems?, photos? }
router.post("/push", async (req, res) => {
  try {
    const body = req.body || {};
    const result = {};
    for (const [key, cols] of Object.entries(TABLES)) {
      result[key] = await upsert(key, cols, body[key]);
    }
    return res.json({ ok: true, pushed: result });
  } catch (e) {
    console.error("push error", e);
    return res.status(500).json({ error: "Erro interno ao enviar dados." });
  }
});
// GET /sync/pull?since=<ISO>
// Retorna tudo que mudou depois de `since` (incluindo tombstones de exclusão).
// Sem `since`, retorna o snapshot completo.
router.get("/pull", async (req, res) => {
  try {
    const since = req.query.since;
    const out = { since: since || null, now: Date.now() };
    for (const [key, cols] of Object.entries(TABLES)) {
      const table = TABLE_NAMES[key];
      const sql = since
        ? `SELECT ${cols.join(", ")} FROM ${table} WHERE updated_at > $1::timestamptz`
        : `SELECT ${cols.join(", ")} FROM ${table}`;
      const { rows } = since ? await pool.query(sql, [since]) : await pool.query(sql);
      out[key] = rows.map((r) => {
        const o = { ...r };
        for (const c of TS_COLS) if (c in o) o[c] = fromDb(o[c]);
        return o;
      });
    }
    return res.json(out);
  } catch (e) {
    console.error("pull error", e);
    return res.status(500).json({ error: "Erro interno ao baixar dados." });
  }
});

export default router;
