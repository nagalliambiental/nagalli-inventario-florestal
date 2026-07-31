// Estrutura horizontal (por parcela) e vertical (por estrato de altura).
import type { Plot, Tree } from "../types";

export interface SpeciesCount {
  name: string;
  count: number;
}

export interface PlotStructure {
  plotId: number;
  plotCode: string;
  treeCount: number;
  speciesCount: number;
  basalAreaM2: number;
  species: SpeciesCount[];
}

export interface VerticalStratum {
  name: string;
  heightMin: number;
  heightMax: number;
  treeCount: number;
  speciesCount: number;
  basalAreaM2: number;
  species: SpeciesCount[];
}

export function calcHorizontalStructure(
  plots: Plot[],
  trees: Tree[]
): PlotStructure[] {
  const codeById: Record<number, string> = {};
  plots.forEach((p) => {
    codeById[p.id] = p.code;
  });

  const byPlot: Record<number, { basal: number; species: Record<string, number> }> = {};
  trees.forEach((t) => {
    if (!byPlot[t.plotId]) byPlot[t.plotId] = { basal: 0, species: {} };
    byPlot[t.plotId].basal += t.basalAreaM2;
    const key = t.speciesName || "Não identificada";
    byPlot[t.plotId].species[key] = (byPlot[t.plotId].species[key] || 0) + 1;
  });

  return Object.entries(byPlot).map(([pid, data]) => {
    const species = Object.entries(data.species)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return {
      plotId: Number(pid),
      plotCode: codeById[Number(pid)] || `P${pid}`,
      treeCount: species.reduce((s, x) => s + x.count, 0),
      speciesCount: species.length,
      basalAreaM2: data.basal,
      species,
    };
  });
}

export function calcVerticalStructure(trees: Tree[]): VerticalStratum[] {
  const heights = trees.map((t) => t.heightTotalM).filter((h) => h > 0);
  if (heights.length === 0) return [];

  const hMax = Math.max(...heights);
  const bounds: { name: string; min: number; max: number }[] = [
    { name: "Inferior", min: 0, max: hMax / 3 },
    { name: "Médio", min: hMax / 3, max: (2 * hMax) / 3 },
    { name: "Superior", min: (2 * hMax) / 3, max: hMax },
  ];

  return bounds.map((b) => {
    const inStrata = trees.filter(
      (t) =>
        t.heightTotalM > 0 &&
        t.heightTotalM >= b.min &&
        (b.name === "Superior" ? t.heightTotalM <= b.max : t.heightTotalM < b.max)
    );
    const species: Record<string, number> = {};
    let basal = 0;
    inStrata.forEach((t) => {
      const key = t.speciesName || "Não identificada";
      species[key] = (species[key] || 0) + 1;
      basal += t.basalAreaM2;
    });
    const list = Object.entries(species)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return {
      name: b.name,
      heightMin: b.min,
      heightMax: b.max,
      treeCount: inStrata.length,
      speciesCount: list.length,
      basalAreaM2: basal,
      species: list,
    };
  });
}
