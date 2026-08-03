import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { Project, Plot, Tree, Species } from "../types";
import {
  capToDbh,
  treeDbhCm,
  treeVolumes,
  calcPlotResults,
  calcShannon,
  calcPielou,
  calcIVI,
  calcSpeciesVolumes,
  sumTreeVolumes,
  FF_VOLUME_TORA,
  FF_VOLUME_TOTAL,
} from "./calculations";
import { calcDiameterDistribution } from "./diametric";
import { calcHorizontalStructure, calcVerticalStructure } from "./structure";
import { calcConama, calcFloristic } from "./conama";
import { buildSamplingReport } from "./sampling";
import { calcSufficiency } from "./sufficiency";

const METHOD_LABEL: Record<string, string> = {
  censo: "Censo",
  parcelas_fixas: "Parcelas fixas",
  pcqm: "PCQM",
  arvores_isoladas: "Árvores isoladas",
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

const ACCENTS: Record<string, string> = {
  Á: "A", À: "A", Â: "A", Ã: "A", Ä: "A", É: "E", È: "E", Ê: "E",
  Í: "I", Ì: "I", Î: "I", Ó: "O", Ò: "O", Ô: "O", Õ: "O", Ö: "O",
  Ú: "U", Ù: "U", Û: "U", Ü: "U", Ç: "C", Ñ: "N",
};

function sanitizeFileName(name: string): string {
  return name
    .toUpperCase()
    .split("")
    .map((c) => ACCENTS[c] || c)
    .join("")
    .replace(/[^A-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");
}

// Gera o relatório Excel em base64 (usado tanto no botão Excel quanto no backup).
export async function buildXlsxBase64(
  project: Project,
  plots: Plot[],
  trees: Tree[],
  species: Species[]
): Promise<string> {
  const XLSX = await import("xlsx");

  const methodLabel = METHOD_LABEL[project.method] || project.method;

  const treeTrees = trees.filter((t) => t.isTree);
  const nonTreeCount = trees.length - treeTrees.length;

  const results = calcPlotResults(treeTrees);
  const shannon = calcShannon(treeTrees);
  const pielou = calcPielou(treeTrees, shannon);
  const ivi = calcIVI(treeTrees);
  const sampling =
    project.method === "parcelas_fixas"
      ? buildSamplingReport(project, plots, treeTrees)
      : null;
  const sufficiency = calcSufficiency(treeTrees, project.method, sampling);
  const speciesVolumes = calcSpeciesVolumes(treeTrees);
  const totalVolumes = sumTreeVolumes(treeTrees);
  const areaHa =
    plots.reduce((s, p) => s + (p.areaM2 > 0 ? p.areaM2 : 0), 0) / 10000;
  const diametric = calcDiameterDistribution(treeTrees, areaHa || 1);
  const horizontal = calcHorizontalStructure(plots, treeTrees);
  const vertical = calcVerticalStructure(treeTrees);
  const conama = calcConama(treeTrees, species, areaHa || 1);
  const floristic = calcFloristic(trees, species);

  const wb = XLSX.utils.book_new();

  // Cabeçalho de marca em todas as abas.
  const branded = (rows: (string | number)[][]): (string | number)[][] => [
    ["NAGALLI AMBIENTAL"],
    [`Inventário Florestal — ${project.name}`],
    [
      `Cliente: ${project.client || "—"} • Local: ${project.location || "—"} • Método: ${methodLabel} • Área: ${project.areaHa} ha`,
    ],
    [],
    ...rows,
  ];

  const appendSheet = (
    name: string,
    sheetRows: (string | number)[][],
    widths?: number[]
  ) => {
    const ws = XLSX.utils.aoa_to_sheet(branded(sheetRows));
    ws["!cols"] = (
      widths ||
      (sheetRows[0] || []).map((c) =>
        Math.min(40, Math.max(10, String(c).length + 2))
      )
    ).map((w: number) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  // ── Resumo ──
  appendSheet(
    "Resumo",
    [
      ["Indicador", "Valor"],
      ["Projeto", project.name],
      ["Cliente", project.client || ""],
      ["Localização", project.location || ""],
      ["Método", methodLabel],
      ["Área (ha)", project.areaHa],
      ["Total de parcelas", plots.length],
      ["Total de árvores", treeTrees.length],
      ["Total de não-árvores (florístico)", nonTreeCount],
      ["Total de espécies", results.speciesCount],
      ["DAP médio (cm)", r2(results.avgDbh)],
      ["Altura média (m)", r2(results.avgHeight)],
      ["Área basal total (m²)", r3(results.basalAreaTotal)],
      [
        "Área basal por ha (m²/ha)",
        r3(areaHa > 0 ? results.basalAreaTotal / areaHa : 0),
      ],
      ["Volume total (m³)", r3(results.volumeTotal)],
      ["Volume tora (m³)", r3(totalVolumes.volumeTora)],
      ["Volume lenha (m³)", r3(totalVolumes.volumeLenha)],
      ["Shannon-Wiener (H')", r3(shannon)],
      ["Pielou (J')", r3(pielou)],
      [
        "Suficiência amostral",
        sufficiency.sufficient ? "Atingida" : "Não atingida",
      ],
      ["Critério de suficiência", sufficiency.reason],
    ],
    [24, 40]
  );

  // ── Árvores ──
  const treeCols = [
    "Parcela", "Nº Árvore", "Espécie", "CAP (cm)", "DAP (cm)",
    "Altura comercial (m)", "Altura total (m)", "Área basal (m²)",
    "Fustes", "Vol tora (m³)", "Vol total (m³)", "Vol lenha (m³)",
    "Condição", "Latitude", "Longitude", "Observações",
  ];
  const treeRows = treeTrees.map((t) => {
    const plot = plots.find((p) => p.id === t.plotId);
    const cap = t.capCm || t.fustes.reduce((s, f) => s + f.capCm, 0);
    const v = treeVolumes(t);
    return [
      plot?.code || "",
      t.number,
      t.speciesName,
      r2(cap),
      r2(treeDbhCm(t)),
      r2(t.heightComercialM),
      r2(t.heightTotalM),
      r3(t.basalAreaM2),
      t.stemCount,
      r3(v.volumeTora),
      r3(v.volumeTotal),
      r3(v.volumeLenha),
      t.phytosanitary,
      t.latitude,
      t.longitude,
      t.notes,
    ];
  });
  appendSheet("Árvores", [treeCols, ...treeRows], [10, 9, 24, 10, 10, 12, 12, 10, 7, 10, 10, 10, 12, 10, 10, 24]);

  // ── Fustes ──
  if (treeRows.length > 0 && treeTrees.some((t) => (t.fustes || []).length > 0)) {
    const stemCols = [
      "Parcela", "Nº Árvore", "Fuste", "CAP (cm)", "DAP (cm)",
      "Altura comercial (m)", "Altura total (m)", "Área basal (m²)",
    ];
    const stemRows: (string | number)[][] = [];
    treeTrees.forEach((t) => {
      const plot = plots.find((p) => p.id === t.plotId);
      (t.fustes || []).forEach((f, i) => {
        stemRows.push([
          plot?.code || "",
          t.number,
          i + 1,
          r2(f.capCm),
          r2(f.dbhCm || 0),
          r2(f.heightComercialM),
          r2(f.heightTotalM),
          r3(f.basalAreaM2),
        ]);
      });
    });
    appendSheet("Fustes", [stemCols, ...stemRows], [10, 9, 7, 10, 10, 12, 12, 10]);
  }

  // ── Distribuição diamétrica ──
  if (diametric) {
    const diamRows: (string | number)[][] = [
      [
        `Classes fixas de 5 cm (5–10, 10–15, 15–20, ...) • área amostrada = ${r3(diametric.areaHa)} ha`,
      ],
      [],
      ["Classe DAP (cm)", "N", "Freq/ha"],
      ...diametric.classes.map((c) => [
        `${r2(c.lower)} – ${r2(c.upper)}`,
        c.count,
        r2(c.freqPerHa),
      ]),
      ["TOTAL", diametric.n, r2(diametric.totalFreqPerHa)],
      [],
      ["Diâmetro equivalente (Deq, cm)", r2(diametric.deq), ""],
      ["Mínimo DAP (cm)", r2(diametric.minDap), ""],
      ["Máximo DAP (cm)", r2(diametric.maxDap), ""],
      ["Nº de classes", diametric.classCount, ""],
      ["Intervalo de classe (cm)", r2(diametric.classWidth), ""],
      ["Área amostrada (ha)", r3(diametric.areaHa), ""],
    ];
    appendSheet("Distribuição diamétrica", diamRows, [22, 8, 10]);
  }

  // ── Volumes de lenha e tora ──
  if (speciesVolumes.length > 0) {
    const volRows: (string | number)[][] = [
      ["Espécie", "N", "Volume tora (m³)", "Volume total (m³)", "Volume lenha (m³)"],
      ...speciesVolumes.map((s) => [
        s.speciesName,
        s.n,
        r3(s.volumeTora),
        r3(s.volumeTotal),
        r3(s.volumeLenha),
      ]),
      [
        "TOTAL",
        treeTrees.length,
        r3(totalVolumes.volumeTora),
        r3(totalVolumes.volumeTotal),
        r3(totalVolumes.volumeLenha),
      ],
      [],
      ["Fórmulas (método do fator de forma):", ""],
      ["V tora = g × Hc × 0,7", ""],
      ["V total = g × Ht × 0,6", ""],
      ["V lenha = V total − V tora", ""],
    ];
    appendSheet("Volumes (lenha e tora)", volRows, [24, 6, 14, 14, 14]);
  }

  // ── Completa (detalhe por fuste + totais expandidos) ──
  // Aba final pronta para anexo em relatórios de inventário florestal,
  // no mesmo formato da planilha de referência (uma linha por fuste).
  if (treeTrees.length > 0) {
    const speciesById = new Map(species.map((s) => [s.id, s]));
    const plotIndexById = new Map(plots.map((p, i) => [p.id, i + 1]));

    const completaCols = [
      "P", "Nº", "Nome científico", "Nome comum", "CAP (cm)", "DAP (cm)",
      "Hc (m)", "Ht (m)", "Gi(m²/ha)", "VC (m³)", "VL (m³)", "Nt (un.)",
    ];
    const completaRows: (string | number)[][] = [];
    const completaDaps: number[] = [];
    let completaBa = 0;
    let completaVc = 0;
    let completaVl = 0;
    let completaHtMax = 0;
    let completaHtMin = Infinity;

    const pushCompletaRow = (
      t: Tree,
      cap: number,
      hc: number,
      ht: number,
      g: number
    ) => {
      const dap = capToDbh(cap);
      const vc = hc > 0 ? g * hc * FF_VOLUME_TORA : 0;
      const vt = ht > 0 ? g * ht * FF_VOLUME_TOTAL : 0;
      const vl = ht > 0 ? Math.max(0, vt - vc) : 0;
      const sp = t.speciesId ? speciesById.get(t.speciesId) : undefined;
      completaBa += g;
      completaVc += vc;
      completaVl += vl;
      completaDaps.push(dap);
      if (ht > 0) {
        completaHtMax = Math.max(completaHtMax, ht);
        completaHtMin = Math.min(completaHtMin, ht);
      }
      completaRows.push([
        plotIndexById.get(t.plotId) ?? "",
        t.number,
        t.speciesName,
        sp?.popularName || t.speciesName,
        cap,
        dap,
        hc > 0 ? hc : "",
        ht > 0 ? ht : "",
        g,
        hc > 0 ? vc : "",
        ht > 0 ? vl : "",
        hc > 0 ? hc / 2 : "",
      ]);
    };

    treeTrees.forEach((t) => {
      if (t.fustes && t.fustes.length > 0) {
        t.fustes.forEach((f) =>
          pushCompletaRow(
            t,
            f.capCm,
            f.heightComercialM,
            f.heightTotalM,
            f.basalAreaM2
          )
        );
      } else {
        pushCompletaRow(
          t,
          t.capCm,
          t.heightComercialM,
          t.heightTotalM,
          t.basalAreaM2
        );
      }
    });

    const completaDapMedio = completaDaps.length
      ? completaDaps.reduce((s, d) => s + d, 0) / completaDaps.length
      : 0;
    const completaTotal = completaVc + completaVl;
    const factor =
      areaHa > 0 ? (project.areaHa || 0) / areaHa : 0;

    const completaRowsSheet = [
      ["Área basal total (m²)", completaBa],
      ["V tora total (m³)", completaVc],
      ["V lenha total (m³)", completaVl],
      ["DAP médio (cm)", completaDapMedio],
      ["DAP máximo (cm)", Math.max(...completaDaps)],
      ["DAP mínimo (cm)", Math.min(...completaDaps)],
      ["Altura máxima (m)", completaHtMax === 0 ? 0 : completaHtMax],
      [
        "Altura mínima (m)",
        completaHtMin === Infinity ? 0 : completaHtMin,
      ],
      [],
      ["", "Amostral", "Total"],
      ["Área (há)", r3(areaHa), r3(project.areaHa || 0)],
      ["V tora (m³)", completaVc, completaVc * factor],
      ["V lenha (m³)", completaVl, completaVl * factor],
      ["Total (m³)", completaTotal, completaTotal * factor],
      ["Árvores", treeTrees.length, Math.round(treeTrees.length * factor)],
    ];

    appendSheet(
      "Completa",
      [
        completaCols,
        ...completaRows,
        [],
        ["Resumo", ""],
        ...completaRowsSheet,
      ],
      [6, 6, 24, 20, 9, 12, 9, 9, 12, 12, 12, 9]
    );
  }

  // ── Amostragem casual simples ──
  if (sampling && sampling.ba && sampling.volume) {
    const samplingRows: (string | number)[][] = [
      ["Parâmetro", "Área basal", "Volume"],
      ["Fator de correção (F)", r4(sampling.ba.fcp), r4(sampling.volume.fcp)],
      ["Média", r3(sampling.ba.mean), r3(sampling.volume.mean)],
      ["Variância amostral (S²)", r4(sampling.ba.sampleVariance), r4(sampling.volume.sampleVariance)],
      ["Desvio padrão (S)", r4(sampling.ba.stdDev), r4(sampling.volume.stdDev)],
      ["Coeficiente de variação (CV%)", r2(sampling.ba.cv), r2(sampling.volume.cv)],
      ["Variância da média (Sx̄²)", r4(sampling.ba.meanVariance), r4(sampling.volume.meanVariance)],
      ["Erro padrão da média (Sx̄)", r4(sampling.ba.meanStdError), r4(sampling.volume.meanStdError)],
      ["t de Student (90%)", r3(sampling.ba.tStudent), r3(sampling.volume.tStudent)],
      ["Erro de amostragem absoluto (E)", r3(sampling.ba.absoluteError), r3(sampling.volume.absoluteError)],
      ["Erro de amostragem relativo (E%)", r2(sampling.ba.relativeError), r2(sampling.volume.relativeError)],
    ];
    const note = `Amostragem casual simples (parcelas fixas) • n = ${sampling.n}, área média da parcela = ${sampling.meanPlotAreaM2.toFixed(0)} m², área total amostrada = ${sampling.totalAreaM2.toFixed(0)} m² (n × área da parcela)${sampling.totalPlots ? `, população estimada = ${sampling.totalPlots} parcelas` : ", população considerada infinita"} • área basal em m² e volume em m³ por parcela (média das somas de cada parcela).`;
    appendSheet(
      "Amostragem",
      [[note], [], ...samplingRows],
      [28, 14, 14]
    );
  }

  // ── Estrutura horizontal ──
  if (horizontal.length > 0) {
    const horizRows: (string | number)[][] = [
      ["Parcela", "N", "Espécies", "Área basal (m²)", "Espécies (N)"],
      ...horizontal.map((h) => [
        h.plotCode,
        h.treeCount,
        h.speciesCount,
        r3(h.basalAreaM2),
        h.species.map((s) => `${s.name} (${s.count})`).join(", "),
      ]),
    ];
    appendSheet("Estrutura horizontal", horizRows, [10, 6, 8, 14, 40]);
  }

  // ── Estrutura vertical ──
  if (vertical.length > 0) {
    const vertRows: (string | number)[][] = [
      ["Estrato", "Faixa (m)", "N", "Espécies", "Área basal (m²)", "Espécies (N)"],
      ...vertical.map((v) => [
        v.name,
        `${r2(v.heightMin)} – ${r2(v.heightMax)}`,
        v.treeCount,
        v.speciesCount,
        r3(v.basalAreaM2),
        v.species.map((s) => `${s.name} (${s.count})`).join(", "),
      ]),
    ];
    appendSheet("Estrutura vertical", vertRows, [10, 12, 6, 8, 14, 40]);
  }

  // ── IVI ──
  if (ivi.length > 0) {
    const iviRows: (string | number)[][] = [
      ["Espécie", "N", "Densidade rel. (%)", "Dominância rel. (%)", "Frequência rel. (%)", "IVI"],
      ...ivi.map((s) => [
        s.speciesName,
        s.n,
        r2(s.density),
        r2(s.dominance),
        r2(s.frequency),
        r2(s.ivi),
      ]),
    ];
    appendSheet("IVI", iviRows, [24, 6, 14, 14, 14, 10]);
  }

  // ── Análise CONAMA 05/94 ──
  if (conama) {
    const conamaRows: (string | number)[][] = [
      ["Análise CONAMA 05/94 — estágios de regeneração da Mata Atlântica"],
      [],
      ["Estrato", "Faixa (m)", "N", "Espécies", "Área basal (m²)", "Altura média (m)", "DAP médio (cm)", "DAP min–max (cm)", "Estágio"],
      ...conama.strata.map((st) => [
        st.name,
        `${r2(st.heightMin)} – ${r2(st.heightMax)}`,
        st.treeCount,
        st.speciesCount,
        r3(st.basalAreaM2),
        r2(st.avgHeightM),
        r2(st.avgDapCm),
        `${r2(st.minDapCm)} – ${r2(st.maxDapCm)}`,
        st.stageLabel,
      ]),
      [],
      ["Indicador", "Valor"],
      ["Nº de estratos", conama.strataCount],
      ["Nº de espécies", conama.totalSpecies],
      ["Nº de árvores", conama.totalTrees],
      ["Área basal (m²)", r3(conama.basalAreaM2)],
      ["Área basal por ha (m²/ha)", r3(conama.basalAreaM2 / (conama.areaHa || 1))],
      ["Altura média (m)", r2(conama.avgHeightM)],
      ["DAP médio (cm)", r2(conama.avgDapCm)],
      ["Amplitude diamétrica (cm)", `${r2(conama.minDapCm)} – ${r2(conama.maxDapCm)}`],
      [],
      ["Atributos por estrato (Resolução CONAMA 05/94):"],
      ...conama.strata.flatMap((st) => [
        [],
        [`Estrato ${st.name} — ${st.stageLabel}`],
        ...st.attributes.map((a) => [a.label, a.value || "—"]),
      ]),
    ];
    appendSheet("Análise CONAMA", conamaRows, [28, 40]);
  }

  // ── Florístico oficial (formato EURO: Família | Espécie | Hábito | Status) ──
  if (floristic.length > 0) {
    const HABIT_CODE: Record<string, string> = {
      A: "A", "A - Arbórea": "A", "Arbórea": "A", Árvore: "A",
      Ar: "Ar", "Ar - Arbustiva": "Ar", Arbustiva: "Ar",
      Er: "Er.", Erva: "Er.", Herbácea: "Er.",
      Li: "Li", "Li - Liana": "Li", Liana: "Li",
      Ep: "Ep.", "Ep - Epífita": "Ep.", "Epífita": "Ep.",
      Pt: "Pt.", "Pt - Pteridófita": "Pt.", "Pteridófita": "Pt.",
      B: "B", "B - Bambu": "B", Bambu: "B",
    };
    const habitCode = (h: string): string => {
      if (!h) return "";
      const t = h.trim();
      if (HABIT_CODE[t]) return HABIT_CODE[t];
      const prefix = t.split(" - ")[0].trim();
      return HABIT_CODE[prefix] ?? t;
    };

    const byFamily: Record<
      string,
      { name: string; habit: string; status: string }[]
    > = {};
    floristic
      .filter(
        (f) =>
          !/^(morta|-|não identificada|nao identificada)$/i.test(
            f.speciesName.trim()
          )
      )
      .forEach((f) => {
        const fam = f.family?.trim() || "—";
        (byFamily[fam] = byFamily[fam] || []).push({
          name: f.speciesName.trim(),
          habit: habitCode(f.habit),
          status: f.conservationStatus?.trim() || "",
        });
      });

    const florRows: (string | number)[][] = [
      ["Família", "Espécie", "Hábito", "Status"],
    ];
    Object.keys(byFamily)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .forEach((fam) => {
        byFamily[fam]
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
          .forEach((s, i) => {
            florRows.push([i === 0 ? fam : "", s.name, s.habit, s.status]);
          });
      });
    appendSheet("Florístico oficial", florRows, [20, 30, 10, 30]);
  }

  wb.Props = {
    Title: `NAGALLI AMBIENTAL — ${project.name}`,
    Company: "Nagalli Ambiental",
    CreatedDate: new Date(),
  };

  const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  return wbout;
}

// Exporta o relatório Excel e abre a folha de compartilhamento.
export async function exportXlsx(
  project: Project,
  plots: Plot[],
  trees: Tree[],
  species: Species[]
) {
  const wbout = await buildXlsxBase64(project, plots, trees, species);
  const uri =
    FileSystem.documentDirectory +
    `${project.name.replace(/[\\/:*?"<>|]/g, "_")}.xlsx`;
  await FileSystem.writeAsStringAsync(uri, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await Sharing.shareAsync(uri, {
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// Lista as fotos do projeto com nomes legíveis (PROJETO_PARCELA_NUMEROARVORE)
// e conteúdo em base64. Usado tanto no botão Imagens quanto no backup completo.
export async function listProjectImageFiles(
  project: Project,
  plots: Plot[],
  trees: Tree[]
): Promise<{ name: string; base64: string; caption: string; treeUuid: string }[]> {
  const plotByTree: Record<string, Plot> = {};
  plots.forEach((p) => {
    plotByTree[p.id] = p;
  });

  const projectName = sanitizeFileName(project.name);
  const files: { name: string; base64: string; caption: string; treeUuid: string }[] = [];

  for (const t of trees) {
    const plotCode = sanitizeFileName(plotByTree[t.plotId]?.code || `P${t.plotId}`);
    const photoUris: { uri: string; caption: string }[] = [];
    if (t.photos && t.photos.length > 0) {
      photoUris.push(...t.photos.map((p) => ({ uri: p.uri, caption: p.caption || "" })));
    } else if (t.photoUri) {
      photoUris.push({ uri: t.photoUri, caption: "" });
    }
    const base = `${projectName}_${plotCode}_${String(t.number).padStart(3, "0")}`;
    for (let i = 0; i < photoUris.length; i++) {
      const uri = photoUris[i].uri;
      const ext = uri.toLowerCase().endsWith(".png") ? "png" : "jpg";
      const name = `${base}${photoUris.length > 1 ? `_${i + 1}` : ""}.${ext}`;
      try {
        const b64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        files.push({ name, base64: b64, caption: photoUris[i].caption, treeUuid: t.id });
      } catch {}
    }
  }
  return files;
}

// Exporta as fotos do projeto em um arquivo ZIP, nomeadas como
// PROJETO_PARCELA_NUMEROARVORE (ex.: FAZENDA_X_P01_001.jpg). Retorna false
// quando o projeto não tem nenhuma foto cadastrada.
export async function exportProjectImages(
  project: Project,
  plots: Plot[],
  trees: Tree[]
): Promise<boolean> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const files = await listProjectImageFiles(project, plots, trees);
  if (files.length === 0) return false;

  const projectName = sanitizeFileName(project.name);
  const readme: string[] = [
    "NAGALLI AMBIENTAL — INVENTÁRIO FLORESTAL",
    "",
    `Projeto: ${project.name}`,
    `Cliente: ${project.client || "—"}`,
    `Local: ${project.location || "—"}`,
    "",
    "Fotos: PROJETO_PARCELA_NUMEROARVORE",
    "",
  ];

  for (const f of files) {
    zip.file(f.name, f.base64, { base64: true });
    readme.push(f.name);
  }

  readme.push("", `Total de imagens: ${files.length}`);
  zip.file("README.txt", readme.join("\n"));

  const b64 = await zip.generateAsync({
    type: "base64",
    compression: "STORE",
  });
  const uri =
    FileSystem.documentDirectory + `${projectName}_IMAGENS.zip`;
  await FileSystem.writeAsStringAsync(uri, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await Sharing.shareAsync(uri, { mimeType: "application/zip" });
  return true;
}

// Gera o conteúdo do arquivo KML (usado tanto no botão KML quanto no backup).
export function buildKmlString(
  project: Project,
  plots: Plot[],
  trees: Tree[]
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>NAGALLI AMBIENTAL — ${project.name}</name>
    <description>Inventário Florestal | ${project.client || ""} | ${project.location || ""} | Método: ${project.method}</description>
    ${trees
      .filter((t) => t.latitude !== 0 && t.longitude !== 0)
      .map(
        (t) => `
    <Placemark>
      <name>#${t.number} - ${t.speciesName || "N/I"}</name>
      <description>NAGALLI AMBIENTAL | CAP: ${t.capCm} cm, Alt total: ${t.heightTotalM} m, DAP: ${treeDbhCm(t)} cm</description>
      <Point><coordinates>${t.longitude},${t.latitude},0</coordinates></Point>
    </Placemark>`
      )
      .join("")}
  </Document>
</kml>`;
}

export async function exportKml(
  project: Project,
  plots: Plot[],
  trees: Tree[]
) {
  const kml = buildKmlString(project, plots, trees);
  const uri =
    FileSystem.documentDirectory +
    `${project.name.replace(/[\\/:*?"<>|]/g, "_")}.kml`;
  await FileSystem.writeAsStringAsync(uri, kml);
  await Sharing.shareAsync(uri, {
    mimeType: "application/vnd.google-earth.kml+xml",
  });
}
