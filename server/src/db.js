import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL?.includes("localhost") || process.env.DATABASE_URL?.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
});

// Executa o schema no boot (idempotente) para que o servidor se auto-inicialize
// ao ser implantado.
export async function initSchema() {
  const sql = readFileSync(join(__dirname, "../sql/schema.sql"), "utf8");
  await pool.query(sql);
}

export default pool;
