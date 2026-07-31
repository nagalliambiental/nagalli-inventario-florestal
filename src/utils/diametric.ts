// Distribuição diamétrica — classes fixas de 5 cm (5–10, 10–15, 15–20, ...).
// Deq da árvore (incluindo todos os fustes): Deq = √(Σ dap²)
// O valor aplicado na distribuição é a média dos Deqs de todas as árvores.
import type { Tree } from "../types";
import { treeDbhCm } from "./calculations";

export const CLASS_WIDTH = 5;

export interface DiameterClass {
  lower: number;
  upper: number;
  count: number;
  freqPerHa: number;
}

export interface DiametricResult {
  n: number;
  minDap: number;
  maxDap: number;
  classCount: number;
  classWidth: number;
  classes: DiameterClass[];
  deq: number;
  totalFreqPerHa: number;
  areaHa: number;
}

export function calcDiameterDistribution(
  trees: Tree[],
  areaHa = 1
): DiametricResult | null {
  // treeDbhCm já retorna o Deq da árvore: para multifuste, √(Σ dap² dos fustes);
  // para fuste único, o próprio DAP.
  const deqs = trees.map((t) => treeDbhCm(t)).filter((d) => d > 0);
  if (deqs.length === 0) return null;

  const n = deqs.length;
  const minDap = Math.min(...deqs);
  const maxDap = Math.max(...deqs);

  const firstLower = Math.floor(minDap / CLASS_WIDTH) * CLASS_WIDTH;
  const lastUpper = Math.ceil(maxDap / CLASS_WIDTH) * CLASS_WIDTH;

  const classes: DiameterClass[] = [];
  for (let lower = firstLower; lower < lastUpper; lower += CLASS_WIDTH) {
    const upper = lower + CLASS_WIDTH;
    const count = deqs.filter((d) =>
      upper >= lastUpper ? d >= lower && d <= upper : d >= lower && d < upper
    ).length;
    classes.push({ lower, upper, count, freqPerHa: count / areaHa });
  }

  // Média dos Deqs de todas as árvores
  const deq = deqs.reduce((s, d) => s + d, 0) / n;

  return {
    n,
    minDap,
    maxDap,
    classCount: classes.length,
    classWidth: CLASS_WIDTH,
    classes,
    deq,
    totalFreqPerHa: n / areaHa,
    areaHa,
  };
}
