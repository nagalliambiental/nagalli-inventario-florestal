import type { Tree } from "../types";

export interface SufficiencyResult {
  totalSpecies: number;
  sampled: { trees: number; species: number }[];
  curve: { x: number; y: number }[];
  sufficient: boolean;
}

export function calcSufficiency(trees: Tree[]): SufficiencyResult {
  if (trees.length === 0) {
    return { totalSpecies: 0, sampled: [], curve: [], sufficient: false };
  }

  const sampled: { trees: number; species: number }[] = [];
  const seen = new Set<string>();
  let speciesCount = 0;

  // Sort by tree number for ordered sampling
  const sorted = [...trees].sort((a, b) => a.number - b.number);

  for (let i = 0; i < sorted.length; i++) {
    const name = sorted[i].speciesName || "NI";
    if (!seen.has(name)) {
      seen.add(name);
      speciesCount++;
    }
    if ((i + 1) % 5 === 0 || i === sorted.length - 1) {
      sampled.push({ trees: i + 1, species: speciesCount });
    }
  }

  const curve = sampled.map((s) => ({ x: s.trees, y: s.species }));

  // Simple heuristic: if last 20% of samples added < 10% new species → sufficient
  const threshold = Math.max(5, Math.floor(sampled.length * 0.2));
  if (sampled.length < threshold + 2) {
    return { totalSpecies: speciesCount, sampled, curve, sufficient: false };
  }

  const recent = sampled.slice(-threshold);
  const firstRecentSpecies = recent[0].species;
  const lastSpecies = recent[recent.length - 1].species;
  const gain = lastSpecies - firstRecentSpecies;
  const sufficient = gain / Math.max(1, lastSpecies) < 0.1;

  return { totalSpecies: speciesCount, sampled, curve, sufficient };
}
