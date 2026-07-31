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
  const basalAreaTotal = trees.reduce((s, t) => s + t.basalAreaM2, 0);
  const volumeTotal = trees.reduce(
    (s, t) => s + estimateVolume(t.dbhCm, t.heightComercialM),
    0
  );
  const avgHeight =
    trees.reduce((s, t) => s + t.heightTotalM, 0) / trees.length;
  const avgDbh =
    trees.reduce((s, t) => s + t.dbhCm, 0) / trees.length;

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
