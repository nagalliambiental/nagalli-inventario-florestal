import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { Project, Plot, Tree, Species } from "../types";
import {
  treeDbhCm,
  treeVolumes,
  calcPlotResults,
  calcShannon,
  calcPielou,
  calcIVI,
  calcSpeciesVolumes,
  sumTreeVolumes,
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

export async function exportXlsx(
  project: Project,
  plots: Plot[],
  trees: Tree[],
  species: Species[]
) {
  const XLSX = await import("xlsx");

  const methodLabel = METHOD_LABEL[project.method] || project.method;

  const treeTrees = trees.filter((t) => t.isTree);
  const nonTreeCount = trees.length - treeTrees.length;

  const results = calcPlotResults(treeTrees);
  const shannon = calcShannon(treeTrees);
  const pielou = calcPielou(treeTrees, shannon);
  const ivi = calcIVI(treeTrees);
  const sufficiency = calcSufficiency(treeTrees);
  const speciesVolumes = calcSpeciesVolumes(treeTrees);
  const totalVolumes = sumTreeVolumes(treeTrees);
  const areaHa =
    plots.reduce((s, p) => s + (p.areaM2 > 0 ? p.areaM2 : 0), 0) / 10000;
  const diametric = calcDiameterDistribution(treeTrees, areaHa || 1);
  const horizontal = calcHorizontalStructure(plots, treeTrees);
  const vertical = calcVerticalStructure(treeTrees);
  const conama = calcConama(treeTrees, species, areaHa || 1);
  const floristic = calcFloristic(trees, species);
  const sampling =
    project.method === "parcelas_fixas"
      ? buildSamplingReport(project, plots, treeTrees)
      : null;

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
        `Regra de Sturges: ${diametric.classCount} classes (IC = ${r2(diametric.classWidth)} cm) • área amostrada = ${r3(diametric.areaHa)} ha`,
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
      ["t de Student (95%)", r3(sampling.ba.tStudent), r3(sampling.volume.tStudent)],
      ["Erro de amostragem absoluto (E)", r3(sampling.ba.absoluteError), r3(sampling.volume.absoluteError)],
      ["Erro de amostragem relativo (E%)", r2(sampling.ba.relativeError), r2(sampling.volume.relativeError)],
    ];
    const note = `Amostragem casual simples (parcelas fixas) • n = ${sampling.n}, área média da parcela = ${sampling.meanPlotAreaM2.toFixed(0)} m²${sampling.totalPlots ? `, população estimada = ${sampling.totalPlots} parcelas` : ", população considerada infinita"} • valores expressos por hectare.`;
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

  // ── Levantamento florístico ──
  if (floristic.length > 0) {
    const florRows: (string | number)[][] = [
      ["Espécie", "N", "Nome popular", "Família", "Hábito", "Distribuição", "Endemismo", "Status de conservação", "Ameaçada"],
      ...floristic.map((f) => [
        f.speciesName,
        f.n,
        f.popularName,
        f.family,
        f.habit,
        f.distribution,
        f.endemism,
        f.conservationStatus,
        f.threatened ? "Sim" : "Não",
      ]),
    ];
    appendSheet("Levantamento florístico", florRows, [24, 6, 20, 16, 14, 16, 16, 20, 10]);
  }

  wb.Props = {
    Title: `NAGALLI AMBIENTAL — ${project.name}`,
    Company: "Nagalli Ambiental",
    CreatedDate: new Date(),
  };

  const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
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

  const plotByTree: Record<number, Plot> = {};
  plots.forEach((p) => {
    plotByTree[p.id] = p;
  });

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

  let total = 0;
  for (const t of trees) {
    const plotCode = sanitizeFileName(plotByTree[t.plotId]?.code || `P${t.plotId}`);
    const photoUris: string[] = [];
    if (t.photos && t.photos.length > 0) {
      photoUris.push(...t.photos.map((p) => p.uri));
    } else if (t.photoUri) {
      photoUris.push(t.photoUri);
    }
    const base = `${projectName}_${plotCode}_${String(t.number).padStart(3, "0")}`;
    for (let i = 0; i < photoUris.length; i++) {
      const uri = photoUris[i];
      const ext = uri.toLowerCase().endsWith(".png") ? "png" : "jpg";
      const name = `${base}${photoUris.length > 1 ? `_${i + 1}` : ""}.${ext}`;
      try {
        const b64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        zip.file(name, b64, { base64: true });
        readme.push(
          `${name}  →  Árvore #${t.number} — ${t.speciesName || "N/I"} (Parcela ${plotByTree[t.plotId]?.code || t.plotId})`
        );
        total++;
      } catch {}
    }
  }

  if (total === 0) return false;

  readme.push("", `Total de imagens: ${total}`);
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

export async function exportKml(
  project: Project,
  plots: Plot[],
  trees: Tree[]
) {
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
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

  const uri =
    FileSystem.documentDirectory +
    `${project.name.replace(/[\\/:*?"<>|]/g, "_")}.kml`;
  await FileSystem.writeAsStringAsync(uri, kml);
  await Sharing.shareAsync(uri, {
    mimeType: "application/vnd.google-earth.kml+xml",
  });
}
