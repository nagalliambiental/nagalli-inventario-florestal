import type { Tree, PlotResults } from "../types";

const PI = Math.PI;

/** CAP (cm) → DAP (cm): DAP = CAP / π */
export function capToDbh(capCm: number): number {
  return capCm / PI;
}

/** DAP (cm) → basal area (m²): g = π * (DAP/200)² */
export function dbhToBasalArea(dbhCm: number): number {
  const r = dbhCm / 200;
  return PI * r * r;
}

/** DAP efetivo da árvore: usa o DAP informado; se ausente (multifuste ou
 * dados de versões antigas), deriva do diâmetro equivalente da área basal
 * ou do CAP. Evita NaN e zeros indevidos no cálculo do DAP médio. */
export function treeDbhCm(
  tree: Pick<Tree, "dbhCm" | "basalAreaM2" | "capCm">
): number {
  const dbh = Number(tree.dbhCm);
  if (Number.isFinite(dbh) && dbh > 0) return dbh;
  const ba = Number(tree.basalAreaM2);
  if (Number.isFinite(ba) && ba > 0) return 200 * Math.sqrt(ba / PI);
  const cap = Number(tree.capCm);
  if (Number.isFinite(cap) && cap > 0) return capToDbh(cap);
  return 0;
}

/** Process tree: compute DBH and basal area from CAP */
export function processTree(
  capCm: number,
  stemCount: number,
  stems?: { capCm: number }[]
): { dbhCm: number; basalAreaM2: number } {
  if (stemCount <= 1) {
    const dbh = capToDbh(capCm);
    return { dbhCm: dbh, basalAreaM2: dbhToBasalArea(dbh) };
  }

  // Multiple stems: dbh = sqrt(Σ dbh_i²)
  const stemsList = stems || [{ capCm }];
  const dbhSquared = stemsList.reduce(
    (sum, s) => sum + capToDbh(s.capCm) ** 2,
    0
  );
  const equivDbh = Math.sqrt(dbhSquared);
  return {
    dbhCm: equivDbh,
    basalAreaM2: stemsList.reduce(
      (sum, s) => sum + dbhToBasalArea(capToDbh(s.capCm)),
      0
    ),
  };
}
// Volume calculation using Schumacher-Hall model (default coefficients)
// V = β0 * DAP^β1 * H^β2
// Default: β0=0.00005, β1=1.8, β2=0.9
export function estimateVolume(
  dbhCm: number,
  heightM: number,
  b0 = 0.00005,
  b1 = 1.8,
  b2 = 0.9
): number {
  if (dbhCm <= 0 || heightM <= 0) return 0;
  return b0 * Math.pow(dbhCm, b1) * Math.pow(heightM, b2);
}

// ── Plot-level results ──

export function calcPlotResults(trees: Tree[]): {
  density: number;
  speciesCount: number;
  basalAreaTotal: number;
  volumeTotal: number;
  avgHeight: number;
  avgDbh: number;
} {
  if (trees.length === 0)
    return {
      density: 0,
      speciesCount: 0,
      basalAreaTotal: 0,
      volumeTotal: 0,
      avgHeight: 0,
      avgDbh: 0,
    };

  const speciesSet = new Set(
    trees.map((t) => t.speciesName).filter(Boolean)
  );
  const basalAreaTotal = trees.reduce(
    (s, t) => s + (Number(t.basalAreaM2) || 0),
    0
  );
  const volumeTotal = trees.reduce(
    (s, t) => s + estimateVolume(treeDbhCm(t), t.heightComercialM || 0),
    0
  );
  const heights = trees.map((t) => Number(t.heightTotalM) || 0);
  const avgHeight =
    heights.length > 0 ? heights.reduce((s, h) => s + h, 0) / heights.length : 0;
  const daps = trees.map(treeDbhCm).filter((d) => d > 0);
  const avgDbh =
    daps.length > 0 ? daps.reduce((s, d) => s + d, 0) / daps.length : 0;

  // Density (trees/ha) assuming 10,000 m² per ha
  // plot area needs to be passed in; using 1 ha placeholder
  const density = trees.length;

  return {
    density,
    speciesCount: speciesSet.size,
    basalAreaTotal,
    volumeTotal,
    avgHeight,
    avgDbh,
  };
}

// ── Shannon-Wiener diversity index ──
// H' = -Σ (pi * ln(pi))
export function calcShannon(trees: Tree[]): number {
  if (trees.length === 0) return 0;
  const counts: Record<string, number> = {};
  trees.forEach((t) => {
    if (t.speciesName) {
      counts[t.speciesName] = (counts[t.speciesName] || 0) + 1;
    }
  });
  const total = trees.length;
  return -Object.values(counts).reduce((sum, c) => {
    const p = c / total;
    return sum + p * Math.log(p);
  }, 0);
}

// ── Pielou evenness ──
// J' = H' / ln(S)
export function calcPielou(trees: Tree[], shannon?: number): number {
  const speciesSet = new Set(
    trees.map((t) => t.speciesName).filter(Boolean)
  );
  const S = speciesSet.size;
  if (S <= 1) return 1;
  const H = shannon ?? calcShannon(trees);
  return H / Math.log(S);
}

// ── IVI (Importance Value Index) ──
export function calcIVI(trees: Tree[]): {
  speciesName: string;
  n: number;
  density: number;
  dominance: number;
  frequency: number;
  ivi: number;
}[] {
  if (trees.length === 0) return [];

  const total = trees.length;
  const basalTotal = trees.reduce((s, t) => s + t.basalAreaM2, 0);

  const bySpecies: Record<
    string,
    { n: number; basal: number; plots: Set<number> }
  > = {};

  trees.forEach((t) => {
    const key = t.speciesName || "Não identificada";
    if (!bySpecies[key])
      bySpecies[key] = { n: 0, basal: 0, plots: new Set() };
    bySpecies[key].n += 1;
    bySpecies[key].basal += t.basalAreaM2;
    bySpecies[key].plots.add(t.plotId);
  });

  const totalPlots = new Set(trees.map((t) => t.plotId)).size;

  return Object.entries(bySpecies)
    .map(([name, data]) => {
      const relDensity = (data.n / total) * 100;
      const relDominance = (data.basal / basalTotal) * 100;
      const relFrequency = (data.plots.size / totalPlots) * 100;
      return {
        speciesName: name,
        n: data.n,
        density: relDensity,
        dominance: relDominance,
        frequency: relFrequency,
        ivi: relDensity + relDominance + relFrequency,
      };
    })
    .sort((a, b) => b.ivi - a.ivi);
}

// ── Volumes por fator de forma (método da planilha de referência) ──
// V tora = g × Hc × 0,7 | V total = g × Ht × 0,6 | V lenha = V total − V tora
export const FF_VOLUME_TORA = 0.7;
export const FF_VOLUME_TOTAL = 0.6;

export interface TreeVolumes {
  volumeTora: number;
  volumeTotal: number;
  volumeLenha: number;
}

export function treeVolumes(tree: Tree): TreeVolumes {
  const fustes =
    tree.fustes && tree.fustes.length > 0 ? tree.fustes : null;

  if (fustes) {
    let volumeTora = 0;
    let volumeTotal = 0;
    for (const f of fustes) {
      if (f.heightComercialM > 0) {
        volumeTora += f.basalAreaM2 * f.heightComercialM * FF_VOLUME_TORA;
      }
      if (f.heightTotalM > 0) {
        volumeTotal += f.basalAreaM2 * f.heightTotalM * FF_VOLUME_TOTAL;
      }
    }
    return {
      volumeTora,
      volumeTotal,
      volumeLenha: Math.max(0, volumeTotal - volumeTora),
    };
  }

  const volumeTora =
    tree.heightComercialM > 0
      ? tree.basalAreaM2 * tree.heightComercialM * FF_VOLUME_TORA
      : 0;
  const volumeTotal =
    tree.heightTotalM > 0
      ? tree.basalAreaM2 * tree.heightTotalM * FF_VOLUME_TOTAL
      : 0;
  return {
    volumeTora,
    volumeTotal,
    volumeLenha: Math.max(0, volumeTotal - volumeTora),
  };
}

export interface SpeciesVolumes {
  speciesName: string;
  n: number;
  volumeTora: number;
  volumeTotal: number;
  volumeLenha: number;
}

export function calcSpeciesVolumes(trees: Tree[]): SpeciesVolumes[] {
  const bySpecies: Record<string, SpeciesVolumes> = {};
  trees.forEach((t) => {
    const key = t.speciesName || "Não identificada";
    const v = treeVolumes(t);
    if (!bySpecies[key]) {
      bySpecies[key] = {
        speciesName: key,
        n: 0,
        volumeTora: 0,
        volumeTotal: 0,
        volumeLenha: 0,
      };
    }
    bySpecies[key].n += 1;
    bySpecies[key].volumeTora += v.volumeTora;
    bySpecies[key].volumeTotal += v.volumeTotal;
    bySpecies[key].volumeLenha += v.volumeLenha;
  });
  return Object.values(bySpecies).sort((a, b) => b.volumeTotal - a.volumeTotal);
}

export function sumTreeVolumes(trees: Tree[]): {
  volumeTora: number;
  volumeTotal: number;
  volumeLenha: number;
} {
  return trees.reduce(
    (acc, t) => {
      const v = treeVolumes(t);
      acc.volumeTora += v.volumeTora;
      acc.volumeTotal += v.volumeTotal;
      acc.volumeLenha += v.volumeLenha;
      return acc;
    },
    { volumeTora: 0, volumeTotal: 0, volumeLenha: 0 }
  );
}
