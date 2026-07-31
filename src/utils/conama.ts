// Análise CONAMA 05/94 (estágios de regeneração da Mata Atlântica) e
// levantamento florístico (hábito, distribuição, endemismo, conservação).
import type { Species, Tree } from "../types";
import { calcVerticalStructure } from "./structure";
import { treeDbhCm } from "./calculations";

export interface ConamaStratum {
  name: string;
  heightMin: number;
  heightMax: number;
  treeCount: number;
  speciesCount: number;
  basalAreaM2: number;
  avgHeightM: number;
  avgDapCm: number;
  minDapCm: number;
  maxDapCm: number;
  stage: ConamaStage | null;
  stageLabel: string;
  attributes: { label: string; value: string }[];
}

export interface ConamaResult {
  strataCount: number;
  totalSpecies: number;
  totalTrees: number;
  basalAreaM2: number;
  avgHeightM: number;
  avgDapCm: number;
  minDapCm: number;
  maxDapCm: number;
  areaHa: number;
  strata: ConamaStratum[];
}

export interface FloristicEntry {
  speciesName: string;
  popularName: string;
  family: string;
  habit: string;
  distribution: string;
  endemism: string;
  conservationStatus: string;
  n: number;
  threatened: boolean;
}

export type ConamaStage = "inicial" | "medio" | "avancado";

// Tabela de referência da Resolução CONAMA 05/94 — atributos qualitativos
// por estágio de regeneração da Mata Atlântica (Art. 2º). Os descritores
// seguem os critérios da resolução; o estágio de cada estrato é classificado
// automaticamente pelas medidas das árvores (DAP médio e altura média).
export interface ConamaStageRef {
  stage: ConamaStage;
  label: string;
  dapMaxCm: number;
  heightMaxM: number;
  attributes: { label: string; value: string }[];
}

export const CONAMA_STAGES: ConamaStageRef[] = [
  {
    stage: "inicial",
    label: "Estágio inicial de regeneração",
    dapMaxCm: 8,
    heightMaxM: 5,
    attributes: [
      { label: "Crescimento das árvores", value: "Rápido (pioneiras)" },
      { label: "Vida média", value: "Curta" },
      { label: "Amplitude diamétrica", value: "Baixa (troncos finos)" },
      { label: "Amplitude de altura", value: "Baixa" },
      { label: "Epífitas", value: "Ausentes ou raras" },
      { label: "Lianas herbáceas", value: "Presentes" },
      { label: "Lianas lenhosas", value: "Raras" },
      { label: "Gramíneas", value: "Presentes" },
      { label: "Regeneração do dossel", value: "Ausente" },
    ],
  },
  {
    stage: "medio",
    label: "Estágio médio de regeneração",
    dapMaxCm: 15,
    heightMaxM: 10,
    attributes: [
      { label: "Crescimento das árvores", value: "Moderado" },
      { label: "Vida média", value: "Média" },
      { label: "Amplitude diamétrica", value: "Média" },
      { label: "Amplitude de altura", value: "Média" },
      { label: "Epífitas", value: "Presentes em pequena quantidade" },
      { label: "Lianas herbáceas", value: "Presentes" },
      { label: "Lianas lenhosas", value: "Poucas" },
      { label: "Gramíneas", value: "Reduzidas" },
      { label: "Regeneração do dossel", value: "Em formação" },
    ],
  },
  {
    stage: "avancado",
    label: "Estágio avançado de regeneração",
    dapMaxCm: Infinity,
    heightMaxM: Infinity,
    attributes: [
      { label: "Crescimento das árvores", value: "Lento (clímax)" },
      { label: "Vida média", value: "Longa" },
      { label: "Amplitude diamétrica", value: "Ampla" },
      { label: "Amplitude de altura", value: "Ampla" },
      { label: "Epífitas", value: "Presentes e abundantes" },
      { label: "Lianas herbáceas", value: "Reduzidas" },
      { label: "Lianas lenhosas", value: "Presentes" },
      { label: "Gramíneas", value: "Ausentes ou raras" },
      { label: "Regeneração do dossel", value: "Presente (clímax)" },
    ],
  },
];

function stageIndexByDap(d: number): number {
  if (d <= 8) return 0;
  if (d <= 15) return 1;
  return 2;
}

function stageIndexByHeight(h: number): number {
  if (h <= 5) return 0;
  if (h <= 10) return 1;
  return 2;
}

/** Classifica o estágio de regeneração pelo DAP médio e altura média
 * (critérios quantitativos do Art. 2º da CONAMA 05/94). Usa o estágio
 * mais conservador quando as duas métricas indicam estágios distintos. */
export function classifyConamaStage(
  avgDapCm: number,
  avgHeightM: number
): ConamaStage | null {
  const idx: number[] = [];
  if (avgDapCm > 0) idx.push(stageIndexByDap(avgDapCm));
  if (avgHeightM > 0) idx.push(stageIndexByHeight(avgHeightM));
  if (idx.length === 0) return null;
  return CONAMA_STAGES[Math.min(...idx)].stage;
}

export function conamaStageRef(stage: ConamaStage): ConamaStageRef {
  return CONAMA_STAGES.find((s) => s.stage === stage)!;
}

const QUALITATIVE: { label: string; pick: (s: Species) => string }[] = [
  { label: "Crescimento das árvores", pick: (s) => s.growth },
  { label: "Vida média", pick: (s) => s.lifeSpan },
  { label: "Amplitude diamétrica", pick: (s) => s.dbhAmplitude },
  { label: "Amplitude de altura", pick: (s) => s.heightAmplitude },
  { label: "Epífitas", pick: (s) => s.epiphytes },
  { label: "Lianas herbáceas", pick: (s) => s.herbaceousLianas },
  { label: "Lianas lenhosas", pick: (s) => s.woodyLianas },
  { label: "Gramíneas", pick: (s) => s.grasses },
  { label: "Regeneração do dossel", pick: (s) => s.canopyRegeneration },
];

function mode(values: string[]): string {
  const valid = values.filter((v) => v && v.trim() !== "");
  if (valid.length === 0) return "";
  const counts: Record<string, number> = {};
  valid.forEach((v) => {
    counts[v] = (counts[v] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function buildSpeciesMaps(species: Species[]): {
  byId: Map<number, Species>;
  byName: Map<string, Species>;
} {
  const byId = new Map<number, Species>();
  const byName = new Map<string, Species>();
  species.forEach((s) => {
    byId.set(s.id, s);
    if (s.scientificName) {
      byName.set(s.scientificName.trim().toLowerCase(), s);
    }
  });
  return { byId, byName };
}

function speciesOf(
  tree: Tree,
  maps: { byId: Map<number, Species>; byName: Map<string, Species> }
): Species | null {
  if (tree.speciesId != null && maps.byId.has(tree.speciesId)) {
    return maps.byId.get(tree.speciesId)!;
  }
  if (tree.speciesName) {
    return maps.byName.get(tree.speciesName.trim().toLowerCase()) || null;
  }
  return null;
}

export function calcConama(
  trees: Tree[],
  species: Species[],
  areaHa = 1
): ConamaResult | null {
  if (trees.length === 0) return null;
  const maps = buildSpeciesMaps(species);
  const vertical = calcVerticalStructure(trees);

  const strata = vertical.map((s) => {
    const inStrata = trees.filter(
      (t) =>
        t.heightTotalM > 0 &&
        t.heightTotalM >= s.heightMin &&
        (s.name === "Superior"
          ? t.heightTotalM <= s.heightMax
          : t.heightTotalM < s.heightMax)
    );
    const spNames = new Set(
      inStrata.map((t) => t.speciesName).filter(Boolean)
    );
    const spList = [...spNames]
      .map((n) => maps.byName.get(n.trim().toLowerCase()))
      .filter((x): x is Species => !!x);
    const d = inStrata.map((t) => treeDbhCm(t)).filter((x) => x > 0);
    const h = inStrata.map((t) => t.heightTotalM).filter((x) => x > 0);
    const avgHeightM = h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0;
    const avgDapCm = d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0;
    const stage = classifyConamaStage(avgDapCm, avgHeightM);
    const stageRef = stage ? conamaStageRef(stage) : null;
    const attributes = stageRef
      ? stageRef.attributes
      : QUALITATIVE.map((q) => ({
          label: q.label,
          value: mode(spList.map((sp) => q.pick(sp))),
        }));
    return {
      name: s.name,
      heightMin: s.heightMin,
      heightMax: s.heightMax,
      treeCount: inStrata.length,
      speciesCount: s.speciesCount,
      basalAreaM2: s.basalAreaM2,
      avgHeightM,
      avgDapCm,
      minDapCm: d.length ? Math.min(...d) : 0,
      maxDapCm: d.length ? Math.max(...d) : 0,
      stage,
      stageLabel: stageRef ? stageRef.label : "Não classificado",
      attributes,
    };
  });

  const heights = trees.map((t) => t.heightTotalM).filter((h) => h > 0);
  const daps = trees.map((t) => treeDbhCm(t)).filter((d) => d > 0);
  const speciesSet = new Set(
    trees.map((t) => t.speciesName).filter(Boolean)
  );

  return {
    strataCount: strata.length,
    totalSpecies: speciesSet.size,
    totalTrees: trees.length,
    basalAreaM2: trees.reduce((s, t) => s + t.basalAreaM2, 0),
    avgHeightM: heights.length
      ? heights.reduce((a, b) => a + b, 0) / heights.length
      : 0,
    avgDapCm: daps.length ? daps.reduce((a, b) => a + b, 0) / daps.length : 0,
    minDapCm: daps.length ? Math.min(...daps) : 0,
    maxDapCm: daps.length ? Math.max(...daps) : 0,
    areaHa,
    strata,
  };
}

export function calcFloristic(
  trees: Tree[],
  species: Species[]
): FloristicEntry[] {
  const maps = buildSpeciesMaps(species);
  const byName: Record<string, { n: number; sp: Species | null }> = {};
  trees.forEach((t) => {
    const name = t.speciesName || "Não identificada";
    if (!byName[name]) byName[name] = { n: 0, sp: speciesOf(t, maps) };
    byName[name].n += 1;
  });
  return Object.entries(byName)
    .map(([name, d]) => ({
      speciesName: name,
      popularName: d.sp?.popularName ?? "",
      family: d.sp?.family ?? "",
      habit: d.sp?.habit ?? "",
      distribution: d.sp?.distribution ?? "",
      endemism: d.sp?.endemism ?? "",
      conservationStatus: d.sp?.conservationStatus ?? "",
      n: d.n,
      threatened: !!(d.sp?.conservationStatus || d.sp?.endemism),
    }))
    .sort((a, b) => b.n - a.n);
}
