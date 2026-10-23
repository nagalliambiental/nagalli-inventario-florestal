import * as SQLite from "expo-sqlite";
import { defaultSpecies } from "../species/brazilian-species";
import { speciesUuid } from "./database";

export async function seedSpecies(db: SQLite.SQLiteDatabase): Promise<void> {
  const t = Date.now();
  await db.withTransactionAsync(async () => {
    for (const s of defaultSpecies) {
      const uuid = speciesUuid(s.scientificName, s.popularName);
      await db.runAsync(
        `INSERT OR IGNORE INTO species (uuid, popular_name, scientific_name, family, phytophysiognomy, wood_density, status_conservacao, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [uuid, s.popularName, s.scientificName, s.family, s.phytophysiognomy, s.woodDensity, s.conservationStatus, t, t]
      );
      await db.runAsync(
        `UPDATE species
         SET status_conservacao = COALESCE(NULLIF(?, ''), status_conservacao)
         WHERE uuid = ? AND deleted_at = 0`,
        [s.conservationStatus, uuid]
      );
    }
  });
}
