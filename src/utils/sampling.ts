// Amostragem casual simples (parcelas fixas) — Erros de amostragem
// Baseado em Péllico Netto & Brena (1997) e Sanquetta et al. (2014).

import type { Project, Plot, Tree } from "../types";
import { treeVolumes } from "./calculations";

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

// Valor crítico de t (bicaudal, α = 0,10 — nível de probabilidade de 90%,
// conforme a planilha de referência)
export function tCritical(df: number): number {
  const table: Record<number, number> = {
    1: 6.314, 2: 2.92, 3: 2.353, 4: 2.132, 5: 2.015,
    6: 1.943, 7: 1.895, 8: 1.86, 9: 1.833, 10: 1.812,
    11: 1.796, 12: 1.782, 13: 1.771, 14: 1.761, 15: 1.753,
    16: 1.746, 17: 1.74, 18: 1.734, 19: 1.729, 20: 1.725,
    21: 1.721, 22: 1.717, 23: 1.714, 24: 1.711, 25: 1.708,
    26: 1.706, 27: 1.703, 28: 1.701, 29: 1.699, 30: 1.697,
  };
  if (df <= 0) return 1.645;
  if (df >= 30) return 1.645;
  return table[Math.round(df)] ?? 1.645;
}

/**
 * Calcula a tabela de amostragem casual simples para um vetor de valores
 * por parcela (ex.: área basal em m² ou volume em m³ por parcela).
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

  // Fator de correção para população finita F = (N - n) / N
  // (convenção da planilha de referência, aplicado sobre a variância da média)
  const fcp = totalPlots && totalPlots > n ? (totalPlots - n) / totalPlots : 1;

  // Variância da média Sx̄² = (S² / n) * F
  const meanVariance = (sampleVariance / n) * fcp;

  // Erro padrão da média Sx̄
  const meanStdError = Math.sqrt(meanVariance);

  // t de Student (bicaudal, 90%)
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
  totalAreaM2: number;
  ba: SimpleRandomSamplingResult | null;
  volume: SimpleRandomSamplingResult | null;
}

/**
 * Monta os valores por parcela (área basal em m² e volume em m³ por parcela)
 * e calcula a tabela de amostragem casual simples para o método "parcelas fixas".
 * A média é a média das somas por parcela. Parcelas sem área cadastrada são
 * consideradas com 1 ha (10.000 m²).
 */
export function buildSamplingReport(
  project: Project,
  plots: Plot[],
  trees: Tree[]
): SamplingReport {
  const n = plots.length;
  if (n < 2) {
    return {
      n,
      totalPlots: null,
      meanPlotAreaM2: 0,
      totalAreaM2: 0,
      ba: null,
      volume: null,
    };
  }

  const baValues: number[] = [];
  const volValues: number[] = [];
  let totalArea = 0;

  for (const plot of plots) {
    const plotTrees = trees.filter((t) => t.plotId === plot.id);
    const areaM2 = plot.areaM2 > 0 ? plot.areaM2 : 10000;
    totalArea += areaM2;

    const ba = plotTrees.reduce((s, t) => s + (t.basalAreaM2 || 0), 0);
    const vol = plotTrees.reduce((s, t) => s + treeVolumes(t).volumeTotal, 0);
    baValues.push(ba);
    volValues.push(vol);
  }
  const meanArea = totalArea / n;

  let totalPlots: number | null = null;
  if (project.areaHa > 0 && meanArea > 0) {
    totalPlots = Math.round((project.areaHa * 10000) / meanArea);
  }

  return {
    n,
    totalPlots,
    meanPlotAreaM2: meanArea,
    totalAreaM2: totalArea,
    ba: calcSimpleRandomSampling(baValues, totalPlots),
    volume: calcSimpleRandomSampling(volValues, totalPlots),
  };
}
