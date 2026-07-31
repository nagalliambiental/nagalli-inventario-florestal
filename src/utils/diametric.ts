// Distribuição diamétrica — regra de Sturges (número de classes)
// e diâmetro equivalente (Deq = √(Σ d² / n)).
import type { Tree } from "../types";
import { treeDbhCm } from "./calculations";

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
  const daps = trees.map((t) => treeDbhCm(t)).filter((d) => d > 0);
  if (daps.length === 0) return null;

  const n = daps.length;
  const minDap = Math.min(...daps);
  const maxDap = Math.max(...daps);

  // Sturges: NC = 1 + 3,322 * log10(n)
  const classCount = Math.max(1, Math.round(1 + 3.322 * Math.log10(n)));
  const amplitude = maxDap - minDap;
  const classWidth = amplitude > 0 ? amplitude / classCount : 1;

  const classes: DiameterClass[] = [];
  for (let i = 0; i < classCount; i++) {
    const lower = minDap + i * classWidth;
    const upper = minDap + (i + 1) * classWidth;
    const count = daps.filter((d) =>
      i === classCount - 1 ? d >= lower && d <= upper : d >= lower && d < upper
    ).length;
    classes.push({ lower, upper, count, freqPerHa: count / areaHa });
  }

  const deq = Math.sqrt(daps.reduce((s, d) => s + d * d, 0) / n);

  return {
    n,
    minDap,
    maxDap,
    classCount,
    classWidth,
    classes,
    deq,
    totalFreqPerHa: n / areaHa,
    areaHa,
  };
}
