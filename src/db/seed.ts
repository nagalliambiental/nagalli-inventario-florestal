import * as SQLite from "expo-sqlite";
import { defaultSpecies } from "../species/brazilian-species";

export async function seedSpecies(db: SQLite.SQLiteDatabase): Promise<void> {
  const count = await db.getFirstAsync<{ "COUNT(*)": number }>(
    "SELECT COUNT(*) FROM species"
  );
  if (count && count["COUNT(*)"] > 0) return;

  await db.withTransactionAsync(async () => {
    for (const s of defaultSpecies) {
      await db.runAsync(
        `INSERT INTO species (popular_name, scientific_name, family, phytophysiognomy, wood_density)
         VALUES (?, ?, ?, ?, ?)`,
        [s.popularName, s.scientificName, s.family, s.phytophysiognomy, s.woodDensity]
      );
    }
  });
}
