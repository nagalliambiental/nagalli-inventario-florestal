import * as SQLite from "expo-sqlite";
import { defaultSpecies } from "../species/brazilian-species";
import { speciesUuid } from "./database";

export async function seedSpecies(db: SQLite.SQLiteDatabase): Promise<void> {
  const count = await db.getFirstAsync<{ "COUNT(*)": number }>(
    "SELECT COUNT(*) FROM species"
  );
  if (count && count["COUNT(*)"] > 0) return;

  const t = Date.now();
  await db.withTransactionAsync(async () => {
    for (const s of defaultSpecies) {
      await db.runAsync(
        `INSERT OR IGNORE INTO species (uuid, popular_name, scientific_name, family, phytophysiognomy, wood_density, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [speciesUuid(s.scientificName, s.popularName), s.popularName, s.scientificName, s.family, s.phytophysiognomy, s.woodDensity, t, t]
      );
    }
  });
}
