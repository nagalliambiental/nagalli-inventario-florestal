// Amostragem casual simples (parcelas fixas) — Erros de amostragem
// Baseado em Péllico Netto & Brena (1997) e Sanquetta et al. (2014).

import type { Project, Plot, Tree } from "../types";
import { estimateVolume, treeDbhCm } from "./calculations";

export interface SimpleRandomSamplingResult {
  n: number;
  mean: number;
  sampleVariance: number;
  stdDev: number;
  cv: number;
  fcp: number;
  meanVariance: number;
  meanStdError: number;
  tStudent: number;
  absoluteError: number;
  relativeError: number;
}

// Valor crítico de t (bicaudal, α = 0,05) para gl = n - 1
export function tCritical(df: number): number {
  const table: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131,
    16: 2.12, 17: 2.11, 18: 2.101, 19: 2.093, 20: 2.086,
    21: 2.08, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.06,
    26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
  };
  if (df <= 0) return 1.96;
  if (df >= 30) return 1.96;
  return table[Math.round(df)] ?? 1.96;
}

/**
 * Calcula a tabela de amostragem casual simples para um vetor de valores
 * por parcela (ex.: área basal m²/ha ou volume m³/ha).
 *
 * @param values     valores da variável em cada parcela
 * @param totalPlots tamanho da população (N = nº possível de parcelas);
 *                   quando indefinido (null) assume população infinita
 */
export function calcSimpleRandomSampling(
  values: number[],
  totalPlots: number | null
): SimpleRandomSamplingResult | null {
  const n = values.length;
  if (n < 2) return null;

  const mean = values.reduce((a, b) => a + b, 0) / n;

  // Variância amostral S² = Σ(xi - x̄)² / (n - 1)
  const sampleVariance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);

  // Desvio padrão S
  const stdDev = Math.sqrt(sampleVariance);

  // Coeficiente de variação CV = (S / x̄) * 100
  const cv = mean !== 0 ? (stdDev / mean) * 100 : 0;

  // Fator de correção para população finita F = sqrt((N - n) / (N - 1))
  const fcp =
    totalPlots && totalPlots > n
      ? Math.sqrt((totalPlots - n) / (totalPlots - 1))
      : 1;

  // Variância da média Sx̄² = (S² / n) * F²
  const meanVariance = (sampleVariance / n) * fcp * fcp;

  // Erro padrão da média Sx̄
  const meanStdError = Math.sqrt(meanVariance);

  // t de Student (bicaudal, 95%)
  const t = tCritical(n - 1);

  // Erro de amostragem absoluto E = t * Sx̄
  const absoluteError = t * meanStdError;

  // Erro de amostragem relativo E% = (E / x̄) * 100
  const relativeError = mean !== 0 ? (absoluteError / mean) * 100 : 0;

  return {
    n,
    mean,
    sampleVariance,
    stdDev,
    cv,
    fcp,
    meanVariance,
    meanStdError,
    tStudent: t,
    absoluteError,
    relativeError,
  };
}

export interface SamplingReport {
  n: number;
  totalPlots: number | null;
  meanPlotAreaM2: number;
  ba: SimpleRandomSamplingResult | null;
  volume: SimpleRandomSamplingResult | null;
}

/**
 * Monta os valores por parcela (área basal e volume por hectare) e calcula
 * a tabela de amostragem casual simples para o método "parcelas fixas".
 * Parcelas sem área cadastrada são consideradas com 1 ha (10.000 m²).
 */
export function buildSamplingReport(
  project: Project,
  plots: Plot[],
  trees: Tree[]
): SamplingReport {
  const n = plots.length;
  if (n < 2) {
    return { n, totalPlots: null, meanPlotAreaM2: 0, ba: null, volume: null };
  }

  const baPerHa: number[] = [];
  const volPerHa: number[] = [];
  let meanArea = 0;

  for (const plot of plots) {
    const plotTrees = trees.filter((t) => t.plotId === plot.id);
    const areaM2 = plot.areaM2 > 0 ? plot.areaM2 : 10000;
    const areaHa = areaM2 / 10000;
    meanArea += areaM2;

    const ba = plotTrees.reduce((s, t) => s + (t.basalAreaM2 || 0), 0);
    const vol = plotTrees.reduce(
      (s, t) => s + estimateVolume(treeDbhCm(t), t.heightComercialM),
      0
    );
    baPerHa.push(ba / areaHa);
    volPerHa.push(vol / areaHa);
  }
  meanArea /= n;

  let totalPlots: number | null = null;
  if (project.areaHa > 0 && meanArea > 0) {
    totalPlots = Math.round((project.areaHa * 10000) / meanArea);
  }

  return {
    n,
    totalPlots,
    meanPlotAreaM2: meanArea,
    ba: calcSimpleRandomSampling(baPerHa, totalPlots),
    volume: calcSimpleRandomSampling(volPerHa, totalPlots),
  };
}
