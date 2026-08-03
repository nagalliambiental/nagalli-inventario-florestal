import type { Tree } from "../types";

export interface SufficiencyResult {
  totalSpecies: number;
  sampled: { trees: number; species: number }[];
  curve: { x: number; y: number }[];
  sufficient: boolean;
  reason: string;
}

function countSpecies(trees: Tree[]): number {
  return new Set(trees.map((t) => t.speciesName).filter(Boolean)).size;
}

/**
 * Suficiência amostral por método:
 * - censo: cobertura total, suficiente por definição;
 * - parcelas fixas: critério estatístico da planilha de referência (erro
 *   relativo de amostragem do volume ≤ 20%);
 * - pcqm / árvores isoladas: estabilização da curva de acumulação de espécies.
 */
export function calcSufficiency(
  trees: Tree[],
  method = "",
  sampling?: { volume?: { relativeError: number } | null } | null
): SufficiencyResult {
  if (trees.length === 0) {
    return {
      totalSpecies: 0,
      sampled: [],
      curve: [],
      sufficient: false,
      reason: "Sem árvores registradas",
    };
  }

  if (method === "censo") {
    return {
      totalSpecies: countSpecies(trees),
      sampled: [],
      curve: [],
      sufficient: true,
      reason: "Censo completo — 100% da área inventariada",
    };
  }

  if (method === "parcelas_fixas" && sampling?.volume) {
    const relErr = sampling.volume.relativeError;
    return {
      totalSpecies: countSpecies(trees),
      sampled: [],
      curve: [],
      sufficient: relErr <= 20,
      reason: `Erro relativo de amostragem do volume: ${relErr.toFixed(1)}% (critério ≤ 20%)`,
    };
  }

  const sampled: { trees: number; species: number }[] = [];
  const seen = new Set<string>();
  let speciesCount = 0;

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

  const threshold = Math.max(5, Math.floor(sampled.length * 0.2));
  if (sampled.length < threshold + 2) {
    return {
      totalSpecies: speciesCount,
      sampled,
      curve,
      sufficient: false,
      reason: "A curva de espécies ainda não estabilizou",
    };
  }

  const recent = sampled.slice(-threshold);
  const firstRecentSpecies = recent[0].species;
  const lastSpecies = recent[recent.length - 1].species;
  const gain = lastSpecies - firstRecentSpecies;
  const sufficient = gain / Math.max(1, lastSpecies) < 0.1;

  return {
    totalSpecies: speciesCount,
    sampled,
    curve,
    sufficient,
    reason: sufficient
      ? "Curva de acumulação de espécies estabilizada"
      : "A curva de espécies ainda não estabilizou",
  };
}
