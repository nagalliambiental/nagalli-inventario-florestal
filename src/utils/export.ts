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

// Tipos de célula com fórmula e valor em cache: o Excel mostra o valor
// calculado pelo app e recalcula ao abrir (fullCalcOnLoad) e ao editar.
type FCell = { t: "n"; f: string; v: number; z?: string };
type SCell = { t: "s"; f: string; v: string };
type Cell = string | number | FCell | SCell;
type SheetRow = Cell[];

const F = (v: number, f: string, z?: string): FCell => ({
  t: "n",
  f,
  v,
  ...(z ? { z } : {}),
});

const FS = (v: string, f: string): SCell => ({ t: "s", f, v });

type FusteRow = {
  plotIdx: number;
  plotCode: string;
  num: number;
  fuste: number;
  sci: string;
  com: string;
  cap: number;
  hc: number;
  ht: number;
};

// Gera o relatório Excel em base64 (usado tanto no botão Excel quanto no backup).
// Estratégia: a aba "Dados de campo" concentra os INPUTS editáveis (espécie,
// CAP, Hc, Ht) e as demais abas derivam tudo por fórmulas — assim, corrigir a
// espécie por foto depois reflete em todas as planilhas automaticamente.
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

  // Cabeçalho de marca em todas as abas (linhas 1 a 4).
  const branded = (rows: SheetRow[]): SheetRow[] => [
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
    sheetRows: SheetRow[],
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

  // ── Aba mestre "Dados de campo" ──
  // Linhas 5–9: parâmetros (células B5..B9 referenciadas pelas fórmulas).
  // Linha 10: em branco; linha 11: cabeçalho; linha 12 em diante: dados (uma
  // linha por fuste). Colunas A, B, C, D, E, F, H, I são INPUTS editáveis; as
  // demais são fórmulas.
  const DC = "Dados de campo";
  const DFIRST = 12;
  const speciesById = new Map(species.map((s) => [s.id, s]));
  const plotIndexById = new Map(plots.map((p, i) => [p.id, i + 1]));
  const plotCodeById = new Map(plots.map((p) => [p.id, p.code]));

  const fusteRows: FusteRow[] = [];
  treeTrees.forEach((t) => {
    const plotIdx = plotIndexById.get(t.plotId) ?? 0;
    const plotCode = plotCodeById.get(t.plotId) || `P${plotIdx}`;
    const sp = t.speciesId ? speciesById.get(t.speciesId) : undefined;
    const sci = t.speciesName || "Não identificada";
    const com = sp?.popularName || t.speciesName || "";
    if (t.fustes && t.fustes.length > 0) {
      t.fustes.forEach((f, i) => {
        fusteRows.push({
          plotIdx,
          plotCode,
          num: t.number,
          fuste: i + 1,
          sci,
          com,
          cap: f.capCm,
          hc: f.heightComercialM,
          ht: f.heightTotalM,
        });
      });
    } else {
      fusteRows.push({
        plotIdx,
        plotCode,
        num: t.number,
        fuste: 1,
        sci,
        com,
        cap: t.capCm,
        hc: t.heightComercialM,
        ht: t.heightTotalM,
      });
    }
  });

  const DLAST = DFIRST + fusteRows.length + 300;

  // Referências absolutas dos parâmetros (células fixas na aba mestre).
  const PHa = `'${DC}'!$B$5`; // área amostrada (ha)
  const PHaTotal = `'${DC}'!$B$6`; // área total do projeto (ha)
  const PffTora = `'${DC}'!$B$7`; // fator de forma — V tora
  const PffTotal = `'${DC}'!$B$8`; // fator de forma — V total
  const PMaxH = `'${DC}'!$B$9`; // altura máxima parametrizada (m)
  const dcRange = (c: string) => `'${DC}'!${c}$${DFIRST}:${c}$${DLAST}`;

  const maxHeight = fusteRows.reduce((m, fr) => Math.max(m, fr.ht), 0);

  const masterRows: SheetRow[] = [];
  fusteRows.forEach((fr, idx) => {
    const r = DFIRST + idx;
    const dap = capToDbh(fr.cap);
    const gi = (Math.PI * dap * dap) / 40000;
    const vc = fr.hc > 0 ? gi * fr.hc * FF_VOLUME_TORA : 0;
    const vt = fr.ht > 0 ? gi * fr.ht * FF_VOLUME_TOTAL : 0;
    const vl = fr.ht > 0 ? Math.max(0, vt - vc) : 0;
    const nt = fr.hc > 0 ? fr.hc / 2 : 0;
    const sch =
      fr.hc > 0 ? 0.00005 * Math.pow(dap, 1.8) * Math.pow(fr.hc, 0.9) : 0;
    const estrato =
      fr.ht > 0
        ? fr.ht <= maxHeight / 3
          ? 1
          : fr.ht <= (2 * maxHeight) / 3
            ? 2
            : 3
        : 0;
    masterRows.push([
      fr.plotIdx || "",
      fr.num,
      fr.fuste,
      fr.sci,
      fr.com,
      fr.cap || "",
      F(r2(dap), `=IF(F${r}="","",ROUND(F${r}/PI(),2))`, "0.00"),
      fr.hc > 0 ? fr.hc : "",
      fr.ht > 0 ? fr.ht : "",
      F(r4(gi), `=IF(G${r}="","",ROUND(PI()*(G${r}/200)^2,4))`, "0.0000"),
      F(
        fr.hc > 0 ? r4(vc) : 0,
        `=IF(OR(H${r}="",J${r}=""),"",ROUND(J${r}*H${r}*${PffTora},4))`,
        "0.0000"
      ),
      F(
        fr.ht > 0 ? r4(vt) : 0,
        `=IF(OR(I${r}="",J${r}=""),"",ROUND(J${r}*I${r}*${PffTotal},4))`,
        "0.0000"
      ),
      F(
        fr.ht > 0 ? r4(vl) : 0,
        `=IF(L${r}="","",ROUND(MAX(0,L${r}-IF(K${r}="",0,K${r})),4))`,
        "0.0000"
      ),
      F(fr.hc > 0 ? r2(nt) : 0, `=IF(H${r}="","",ROUND(H${r}/2,2))`, "0.00"),
      fr.plotCode,
      F(
        fr.hc > 0 ? r4(sch) : 0,
        `=IF(OR(G${r}="",H${r}=""),"",ROUND(0.00005*G${r}^1.8*H${r}^0.9,4))`,
        "0.0000"
      ),
      F(
        estrato,
        `=IF(I${r}="","",IF(I${r}<=ROUND(${PMaxH}/3,3),1,IF(I${r}<=ROUND(2*${PMaxH}/3,3),2,3)))`,
        "0"
      ),
      FS(
        `${fr.plotCode}|${fr.num}`,
        `=IF(OR(O${r}="",B${r}=""),"",O${r}&"|"&B${r})`
      ),
    ]);
  });

  appendSheet(
    DC,
    [
      ["Área amostrada (ha)", r3(areaHa)],
      ["Área total do projeto (ha)", project.areaHa],
      ["Fator de forma — V tora (ff)", FF_VOLUME_TORA],
      ["Fator de forma — V total (ff)", FF_VOLUME_TOTAL],
      [
        "Altura máxima (m)",
        F(
          r2(maxHeight),
          `=IFERROR(MAX($I$${DFIRST}:$I$${DLAST}),0)`,
          "0.00"
        ),
      ],
      [],
      [
        "P", "Nº", "Fuste", "Nome científico", "Nome comum", "CAP (cm)",
        "DAP (cm)", "Hc (m)", "Ht (m)", "Gi (m²)", "VC (m³)",
        "V total (m³)", "VL (m³)", "Nt (un.)", "Parcela", "V Schumacher (m³)",
        "Estrato", "Chave",
      ],
      ...masterRows,
    ],
    [4, 6, 7, 24, 20, 9, 9, 9, 9, 10, 10, 11, 10, 8, 10, 13, 8, 12]
  );

  // ── Árvores (uma linha por árvore; fórmulas que agregam a aba mestre) ──
  const AR_FIRST = 6;
  const AR_LAST = treeTrees.length > 0 ? AR_FIRST + treeTrees.length - 1 : AR_FIRST;
  const arRng = (c: string) => `'Árvores'!${c}$${AR_FIRST}:${c}$${AR_LAST}`;

  const ATreeCols: string[] = [
    "Parcela", "Nº Árvore", "Espécie", "CAP (cm)", "DAP (cm)",
    "Altura comercial (m)", "Altura total (m)", "Área basal (m²)",
    "Fustes", "Vol tora (m³)", "Vol total (m³)", "Vol lenha (m³)",
    "Condição", "Latitude", "Longitude", "Observações", "Chave",
  ];
  const atreeRows: SheetRow[] = [];
  treeTrees.forEach((t, i) => {
    const row = AR_FIRST + i;
    const plotCode =
      plotCodeById.get(t.plotId) || `P${plotIndexById.get(t.plotId) ?? 0}`;
    const cap = t.capCm || (t.fustes || []).reduce((s, f) => s + f.capCm, 0);
    const v = treeVolumes(t);
    const key = `$Q${row}`;
    atreeRows.push([
      plotCode,
      t.number,
      FS(
        t.speciesName || "Não identificada",
        `=IFERROR(INDEX(${dcRange("D")},MATCH(${key},${dcRange("R")},0)),"")`
      ),
      F(
        r2(cap),
        `=IFERROR(SUMIFS(${dcRange("F")},${dcRange("R")},${key}),0)`,
        "0.00"
      ),
      F(
        r2(treeDbhCm(t)),
        `=IFERROR(ROUND(SQRT(SUMPRODUCT((${dcRange("R")}=${key})*IF(ISNUMBER(${dcRange("G")}),${dcRange("G")}^2,0))),2),0)`,
        "0.00"
      ),
      r2(t.heightComercialM),
      r2(t.heightTotalM),
      F(
        r3(t.basalAreaM2),
        `=IFERROR(SUMIFS(${dcRange("J")},${dcRange("R")},${key}),0)`,
        "0.000"
      ),
      F(t.stemCount, `=IFERROR(COUNTIF(${dcRange("R")},${key}),0)`, "0"),
      F(
        r3(v.volumeTora),
        `=IFERROR(SUMIFS(${dcRange("K")},${dcRange("R")},${key}),0)`,
        "0.000"
      ),
      F(
        r3(v.volumeTotal),
        `=IFERROR(SUMIFS(${dcRange("L")},${dcRange("R")},${key}),0)`,
        "0.000"
      ),
      F(
        r3(v.volumeLenha),
        `=IFERROR(SUMIFS(${dcRange("M")},${dcRange("R")},${key}),0)`,
        "0.000"
      ),
      t.phytosanitary,
      t.latitude,
      t.longitude,
      t.notes,
      FS(
        `${plotCode}|${t.number}`,
        `=IF(OR($A${row}="",$B${row}=""),"",$A${row}&"|"&$B${row})`
      ),
    ]);
  });
  appendSheet(
    "Árvores",
    [ATreeCols, ...atreeRows],
    [10, 9, 24, 10, 10, 12, 12, 10, 7, 10, 10, 10, 12, 10, 10, 24, 16]
  );

  // ── Fustes (subconjunto da aba mestre, fórmulas de referência) ──
  if (fusteRows.length > 0) {
    const stemCols = [
      "Parcela", "Nº Árvore", "Fuste", "CAP (cm)", "DAP (cm)",
      "Altura comercial (m)", "Altura total (m)", "Área basal (m²)",
    ];
    const stemRows: SheetRow[] = fusteRows.map((fr, i) => {
      const r = DFIRST + i;
      const dap = capToDbh(fr.cap);
      const gi = (Math.PI * dap * dap) / 40000;
      return [
        FS(fr.plotCode, `='${DC}'!O${r}`),
        F(fr.num, `='${DC}'!B${r}`, "0"),
        F(fr.fuste, `='${DC}'!C${r}`, "0"),
        F(fr.cap || 0, `='${DC}'!F${r}`, "0.00"),
        F(r2(dap), `='${DC}'!G${r}`, "0.00"),
        F(fr.hc > 0 ? r2(fr.hc) : 0, `='${DC}'!H${r}`, "0.00"),
        F(fr.ht > 0 ? r2(fr.ht) : 0, `='${DC}'!I${r}`, "0.00"),
        F(r3(gi), `='${DC}'!J${r}`, "0.000"),
      ];
    });
    appendSheet("Fustes", [stemCols, ...stemRows], [10, 9, 7, 10, 10, 12, 12, 10]);
  }

  // ── Resumo ──
  const speciesDistinct = `SUMPRODUCT((${dcRange(
    "D"
  )}<>"")/COUNTIF(${dcRange("D")},${dcRange("D")}))`;
  const shannonFormula = `IFERROR(-SUMPRODUCT((COUNTIF(${dcRange(
    "D"
  )},${dcRange("D")})/MAX(1,COUNTA(${dcRange(
    "D"
  )})))*LN(COUNTIF(${dcRange(
    "D"
  )},${dcRange("D")})/MAX(1,COUNTA(${dcRange("D")}))))/MAX(1,COUNTA(${dcRange(
    "D"
  )})),0)`;
  const resumoNext = () => 5 + resumoRows.length;
  const resumoRows: SheetRow[] = [["Indicador", "Valor"]];
  resumoRows.push(["Projeto", project.name]);
  resumoRows.push(["Cliente", project.client || "—"]);
  resumoRows.push(["Localização", project.location || "—"]);
  resumoRows.push(["Método", methodLabel]);
  resumoRows.push(["Área (ha)", project.areaHa]);
  resumoRows.push(["Total de parcelas", plots.length]);
  resumoRows.push([
    "Total de árvores",
    F(treeTrees.length, `=COUNT(${arRng("B")})`, "0"),
  ]);
  resumoRows.push(["Total de não-árvores (florístico)", nonTreeCount]);
  resumoRows.push([
    "Total de espécies",
    F(results.speciesCount, `=IFERROR(${speciesDistinct},0)`, "0"),
  ]);
  resumoRows.push([
    "DAP médio (cm)",
    F(
      r2(results.avgDbh),
      `=IFERROR(ROUND(AVERAGEIF(${dcRange("G")},">0"),2),0)`,
      "0.00"
    ),
  ]);
  resumoRows.push([
    "Altura média (m)",
    F(
      r2(results.avgHeight),
      `=IFERROR(ROUND(AVERAGEIF(${dcRange("I")},">0"),2),0)`,
      "0.00"
    ),
  ]);
  resumoRows.push([
    "Área basal total (m²)",
    F(r3(results.basalAreaTotal), `=ROUND(SUM(${dcRange("J")}),3)`, "0.000"),
  ]);
  resumoRows.push([
    "Área basal por ha (m²/ha)",
    F(
      r3(areaHa > 0 ? results.basalAreaTotal / areaHa : 0),
      `=IF(${PHa}=0,0,ROUND(SUM(${dcRange("J")})/${PHa},3))`,
      "0.000"
    ),
  ]);
  resumoRows.push([
    "Volume total (m³)",
    F(r3(totalVolumes.volumeTotal), `=ROUND(SUM(${dcRange("L")}),3)`, "0.000"),
  ]);
  resumoRows.push([
    "Volume tora (m³)",
    F(r3(totalVolumes.volumeTora), `=ROUND(SUM(${dcRange("K")}),3)`, "0.000"),
  ]);
  resumoRows.push([
    "Volume lenha (m³)",
    F(r3(totalVolumes.volumeLenha), `=ROUND(SUM(${dcRange("M")}),3)`, "0.000"),
  ]);
  const shannonRow = resumoNext();
  resumoRows.push([
    "Shannon-Wiener (H')",
    F(r3(shannon), `=${shannonFormula}`, "0.000"),
  ]);
  resumoRows.push([
    "Pielou (J')",
    F(r3(pielou), `=IFERROR($B$${shannonRow}/LN(MAX(1,${speciesDistinct})),0)`, "0.000"),
  ]);
  resumoRows.push([
    "Suficiência amostral",
    sufficiency.sufficient ? "Atingida" : "Não atingida",
  ]);
  resumoRows.push(["Critério de suficiência", sufficiency.reason]);
  appendSheet("Resumo", resumoRows, [24, 40]);

  // ── Distribuição diamétrica (fórmulas sobre 'Árvores' col. E = DAP) ──
  if (diametric) {
    const dimFirst = 8;
    const dimRows: SheetRow[] = [];
    diametric.classes.forEach((c, i) => {
      const r = dimFirst + i;
      const isLast = i === diametric.classes.length - 1;
      const op = isLast ? "<=" : "<";
      dimRows.push([
        FS(`${r2(c.lower)} – ${r2(c.upper)}`, `=B${r}&" – "&C${r}`),
        c.lower,
        c.upper,
        F(
          c.count,
          `=IFERROR(COUNTIFS(${arRng("E")},">="&B${r},${arRng("E")},"${op}"&C${r}),0)`,
          "0"
        ),
        F(r2(c.freqPerHa), `=IF(${PHa}=0,0,D${r}/${PHa})`, "0.00"),
      ]);
    });
    const dimLast = dimFirst + diametric.classes.length - 1;
    const dimSheetRows: SheetRow[] = [
      [
        `Classes fixas de 5 cm (5–10, 10–15, 15–20, ...) • área amostrada = ${r3(
          diametric.areaHa
        )} ha`,
      ],
      [],
      ["Classe DAP (cm)", "Lim. inf (cm)", "Lim. sup (cm)", "N", "Freq/ha"],
      ...dimRows,
      [
        FS("TOTAL", ""),
        "",
        "",
        F(diametric.n, `=SUM(D${dimFirst}:D${dimLast})`, "0"),
        F(
          r2(diametric.totalFreqPerHa),
          `=SUM(E${dimFirst}:E${dimLast})`,
          "0.00"
        ),
      ],
      [],
      [
        FS("Diâmetro equivalente (Deq, cm)", ""),
        "",
        "",
        F(
          r2(diametric.deq),
          `=IFERROR(ROUND(AVERAGE(${arRng("E")}),2),0)`,
          "0.00"
        ),
      ],
      [
        FS("Mínimo DAP (cm)", ""),
        "",
        "",
        F(
          r2(diametric.minDap),
          `=IFERROR(MIN(${arRng("E")}),0)`,
          "0.00"
        ),
      ],
      [
        FS("Máximo DAP (cm)", ""),
        "",
        "",
        F(
          r2(diametric.maxDap),
          `=IFERROR(MAX(${arRng("E")}),0)`,
          "0.00"
        ),
      ],
      [
        FS("Nº de classes", ""),
        "",
        "",
        F(diametric.classCount, `=COUNT(D${dimFirst}:D${dimLast})`, "0"),
      ],
      [FS("Intervalo de classe (cm)", ""), "", "", diametric.classWidth],
      [
        FS("Área amostrada (ha)", ""),
        "",
        "",
        F(r3(diametric.areaHa), `=${PHa}`, "0.000"),
      ],
    ];
    appendSheet("Distribuição diamétrica", dimSheetRows, [26, 12, 12, 8, 10]);
  }

  // ── Volumes de lenha e tora (fórmulas por espécie) ──
  if (speciesVolumes.length > 0) {
    const volFirst = 6;
    const volRows: SheetRow[] = [
      [
        "Espécie", "N", "Volume tora (m³)", "Volume total (m³)",
        "Volume lenha (m³)",
      ],
    ];
    speciesVolumes.forEach((s, i) => {
      const r = volFirst + i;
      volRows.push([
        s.speciesName,
        F(s.n, `=COUNTIF(${dcRange("D")},$A${r})`, "0"),
        F(
          r3(s.volumeTora),
          `=IFERROR(SUMIFS(${dcRange("K")},${dcRange("D")},$A${r}),0)`,
          "0.000"
        ),
        F(
          r3(s.volumeTotal),
          `=IFERROR(SUMIFS(${dcRange("L")},${dcRange("D")},$A${r}),0)`,
          "0.000"
        ),
        F(
          r3(s.volumeLenha),
          `=IFERROR(SUMIFS(${dcRange("M")},${dcRange("D")},$A${r}),0)`,
          "0.000"
        ),
      ]);
    });
    const totalRow = volFirst + speciesVolumes.length;
    const sumRange = (c: string) => `${c}${volFirst}:${c}${totalRow - 1}`;
    volRows.push([
      FS("TOTAL", ""),
      F(treeTrees.length, `=SUM(${sumRange("B")})`, "0"),
      F(r3(totalVolumes.volumeTora), `=SUM(${sumRange("C")})`, "0.000"),
      F(r3(totalVolumes.volumeTotal), `=SUM(${sumRange("D")})`, "0.000"),
      F(r3(totalVolumes.volumeLenha), `=SUM(${sumRange("E")})`, "0.000"),
    ]);
    volRows.push([]);
    volRows.push([FS("Fórmulas (método do fator de forma):", "")]);
    volRows.push([`V tora = g × Hc × ${FF_VOLUME_TORA}`]);
    volRows.push([`V total = g × Ht × ${FF_VOLUME_TOTAL}`]);
    volRows.push(["V lenha = V total − V tora"]);
    appendSheet("Volumes (lenha e tora)", volRows, [24, 6, 14, 14, 14]);
  }

  // ── Completa (referencia a aba mestre, no formato da planilha de referência) ──
  if (treeTrees.length > 0) {
    const compCols = [
      "P", "Nº", "Nome científico", "Nome comum", "CAP (cm)", "DAP (cm)",
      "Hc (m)", "Ht (m)", "Gi (m²)", "VC (m³)", "VL (m³)", "Nt (un.)",
    ];
    const compRows: SheetRow[] = fusteRows.map((fr, i) => {
      const r = DFIRST + i;
      const dap = capToDbh(fr.cap);
      const gi = (Math.PI * dap * dap) / 40000;
      const vc = fr.hc > 0 ? gi * fr.hc * FF_VOLUME_TORA : 0;
      const vl =
        fr.ht > 0 ? Math.max(0, gi * fr.ht * FF_VOLUME_TOTAL - vc) : 0;
      return [
        F(fr.plotIdx || 0, `='${DC}'!A${r}`, "0"),
        F(fr.num, `='${DC}'!B${r}`, "0"),
        FS(fr.sci, `='${DC}'!D${r}`),
        FS(fr.com, `='${DC}'!E${r}`),
        F(fr.cap || 0, `='${DC}'!F${r}`, "0.00"),
        F(r2(dap), `='${DC}'!G${r}`, "0.00"),
        F(fr.hc > 0 ? r2(fr.hc) : 0, `='${DC}'!H${r}`, "0.00"),
        F(fr.ht > 0 ? r2(fr.ht) : 0, `='${DC}'!I${r}`, "0.00"),
        F(r4(gi), `='${DC}'!J${r}`, "0.0000"),
        F(fr.hc > 0 ? r4(vc) : 0, `='${DC}'!K${r}`, "0.0000"),
        F(
          fr.ht > 0 ? r4(vl) : 0,
          `='${DC}'!M${r}`,
          "0.0000"
        ),
        F(fr.hc > 0 ? r2(fr.hc / 2) : 0, `='${DC}'!N${r}`, "0.00"),
      ];
    });

    const compLast = 6 + compRows.length - 1;
    const s0 = compLast + 3; // primeira linha do bloco de resumo

    const vcTot = totalVolumes.volumeTora;
    const vlTot = totalVolumes.volumeLenha;
    const vTot = totalVolumes.volumeTotal;
    const factor = areaHa > 0 ? (project.areaHa || 0) / areaHa : 0;
    const dapsAll = fusteRows
      .map((fr) => capToDbh(fr.cap))
      .filter((d) => d > 0);
    const htsAll = fusteRows.map((fr) => fr.ht).filter((h) => h > 0);

    const baSum = `=ROUND(SUM(${dcRange("J")}),3)`;
    const vcSum = `=ROUND(SUM(${dcRange("K")}),3)`;
    const vlSum = `=ROUND(SUM(${dcRange("M")}),3)`;
    const vSum = `=ROUND(SUM(${dcRange("L")}),3)`;
    const dapMed = `=IFERROR(ROUND(AVERAGEIF(${dcRange("G")},">0"),2),0)`;
    const dapMax = `=IFERROR(MAX(${dcRange("G")}),0)`;
    const dapMin = `=IFERROR(MINIFS(${dcRange("G")},${dcRange("G")},">0"),0)`;
    const htMax = `=IFERROR(MAX(${dcRange("I")}),0)`;
    const htMin = `=IFERROR(MINIFS(${dcRange("I")},${dcRange("I")},">0"),0)`;

    const r11 = s0 + 11; // Fator de expansão
    const r12 = s0 + 12; // V tora (m³)
    const r13 = s0 + 13; // V lenha (m³)
    const r14 = s0 + 14; // Total (m³)
    const r15 = s0 + 15; // Árvores

    const completaRowsSheet: SheetRow[] = [
      ["Área basal total (m²)", F(r3(results.basalAreaTotal), baSum, "0.000")],
      ["V tora total (m³)", F(r3(vcTot), vcSum, "0.000")],
      ["V lenha total (m³)", F(r3(vlTot), vlSum, "0.000")],
      [
        "DAP médio (cm)",
        F(r2(dapsAll.length ? dapsAll.reduce((a, b) => a + b, 0) / dapsAll.length : 0), dapMed, "0.00"),
      ],
      ["DAP máximo (cm)", F(r2(dapsAll.length ? Math.max(...dapsAll) : 0), dapMax, "0.00")],
      ["DAP mínimo (cm)", F(r2(dapsAll.length ? Math.min(...dapsAll) : 0), dapMin, "0.00")],
      ["Altura máxima (m)", F(r2(htsAll.length ? Math.max(...htsAll) : 0), htMax, "0.00")],
      ["Altura mínima (m)", F(r2(htsAll.length ? Math.min(...htsAll) : 0), htMin, "0.00")],
      [],
      ["", "Amostral", "Total"],
      [
        "Área (há)",
        F(r3(areaHa), `=${PHa}`, "0.000"),
        F(project.areaHa || 0, `=${PHaTotal}`, "0.000"),
      ],
      [
        "Fator de expansão",
        F(r3(factor), `=IF(${PHa}=0,0,${PHaTotal}/${PHa})`, "0.000"),
      ],
      [
        "V tora (m³)",
        F(r3(vcTot), vcSum, "0.000"),
        F(r3(vcTot * factor), `=IF(${PHa}=0,0,B${r12}*B${r11})`, "0.000"),
      ],
      [
        "V lenha (m³)",
        F(r3(vlTot), vlSum, "0.000"),
        F(r3(vlTot * factor), `=IF(${PHa}=0,0,B${r13}*B${r11})`, "0.000"),
      ],
      [
        "Total (m³)",
        F(r3(vTot), vSum, "0.000"),
        F(r3(vTot * factor), `=IF(${PHa}=0,0,B${r14}*B${r11})`, "0.000"),
      ],
      [
        "Árvores",
        F(treeTrees.length, `=COUNT(${arRng("B")})`, "0"),
        F(
          r3(treeTrees.length * factor),
          `=IF(${PHa}=0,0,B${r15}*B${r11})`,
          "0"
        ),
      ],
    ];

    appendSheet(
      "Completa",
      [
        compCols,
        ...compRows,
        [],
        ["Resumo", ""],
        ...completaRowsSheet,
      ],
      [6, 6, 24, 20, 9, 12, 9, 9, 12, 12, 12, 9]
    );
  }

  // ── Amostragem casual simples (fórmulas de estatística) ──
  if (sampling && sampling.ba && sampling.volume) {
    const ba = sampling.ba;
    const vol = sampling.volume;
    const amData = plots.map((p) => {
      const pt = treeTrees.filter((t) => t.plotId === p.id);
      const baS = pt.reduce((s, t) => s + (t.basalAreaM2 || 0), 0);
      const volS = pt.reduce((s, t) => s + treeVolumes(t).volumeTotal, 0);
      return { code: p.code, ba: baS, vol: volS };
    });
    const amFirst = 8;
    const amLast = amFirst + amData.length - 1;
    const baRng = `B${amFirst}:B${amLast}`;
    const volRng = `C${amFirst}:C${amLast}`;

    const note = `Amostragem casual simples (parcelas fixas) • n = ${sampling.n}, área média da parcela = ${sampling.meanPlotAreaM2.toFixed(0)} m², área total amostrada = ${sampling.totalAreaM2.toFixed(0)} m² (n × área da parcela)${sampling.totalPlots ? `, população estimada = ${sampling.totalPlots} parcelas` : ", população considerada infinita"} • área basal em m² e volume em m³ por parcela (média das somas de cada parcela). Edite os dados na aba 'Dados de campo' e esta aba recalcula ao abrir o arquivo.`;

    const amoRows: SheetRow[] = [
      [note],
      [],
      ["Parcela", "Área basal (m²)", "Volume (m³)"],
      ...amData.map((d, i) => {
        const r = amFirst + i;
        return [
          d.code,
          F(
            r3(d.ba),
            `=SUMIFS(${dcRange("J")},${dcRange("O")},$A${r})`,
            "0.000"
          ),
          F(
            r3(d.vol),
            `=SUMIFS(${dcRange("L")},${dcRange("O")},$A${r})`,
            "0.000"
          ),
        ];
      }),
      [],
    ];

    const base = amLast + 2; // linha "N populacional"

    const stat = (
      label: string,
      baV: number,
      volV: number,
      baF: string,
      volF: string,
      z: string
    ): SheetRow => [label, F(r4(baV), baF, z), F(r4(volV), volF, z)];
    amoRows.push([
      "N populacional (parcelas)",
      sampling.totalPlots ?? 0,
      sampling.totalPlots ?? 0,
    ]);
    amoRows.push(
      stat("n (parcelas amostradas)", ba.n, vol.n,
        `=COUNT(${baRng})`, `=COUNT(${volRng})`, "0")
    );
    amoRows.push(
      stat("Média (x̄)", ba.mean, vol.mean,
        `=IFERROR(ROUND(AVERAGE(${baRng}),3),0)`,
        `=IFERROR(ROUND(AVERAGE(${volRng}),3),0)`, "0.000")
    );
    amoRows.push(
      stat("Variância amostral (S²)", ba.sampleVariance, vol.sampleVariance,
        `=IFERROR(ROUND(VAR.S(${baRng}),4),0)`,
        `=IFERROR(ROUND(VAR.S(${volRng}),4),0)`, "0.0000")
    );
    amoRows.push(
      stat("Desvio padrão (S)", ba.stdDev, vol.stdDev,
        `=IFERROR(ROUND(STDEV.S(${baRng}),4),0)`,
        `=IFERROR(ROUND(STDEV.S(${volRng}),4),0)`, "0.0000")
    );
    amoRows.push(
      stat("Coeficiente de variação (CV %)", ba.cv, vol.cv,
        `=IFERROR(ROUND(STDEV.S(${baRng})/AVERAGE(${baRng})*100,2),0)`,
        `=IFERROR(ROUND(STDEV.S(${volRng})/AVERAGE(${volRng})*100,2),0)`, "0.00")
    );
    amoRows.push(
      stat("Fator de correção (F)", ba.fcp, vol.fcp,
        `=IF(OR(B${base}<=0,B${base + 1}<=0),1,IF(B${base}<=B${base + 1},1,(B${base}-B${base + 1})/B${base}))`,
        `=IF(OR(C${base}<=0,C${base + 1}<=0),1,IF(C${base}<=C${base + 1},1,(C${base}-C${base + 1})/C${base}))`, "0.0000")
    );
    amoRows.push(
      stat("Variância da média (Sx̄²)", ba.meanVariance, vol.meanVariance,
        `=B${base + 3}/B${base + 1}*B${base + 6}`,
        `=C${base + 3}/C${base + 1}*C${base + 6}`, "0.0000")
    );
    amoRows.push(
      stat("Erro padrão da média (Sx̄)", ba.meanStdError, vol.meanStdError,
        `=SQRT(B${base + 7})`, `=SQRT(C${base + 7})`, "0.0000")
    );
    amoRows.push(
      stat("t (Student, 90%)", ba.tStudent, vol.tStudent,
        `=IFERROR(T.INV.2T(0.1,MAX(1,B${base + 1}-1)),1.645)`,
        `=IFERROR(T.INV.2T(0.1,MAX(1,C${base + 1}-1)),1.645)`, "0.000")
    );
    amoRows.push(
      stat("Erro de amostragem absoluto (E)", ba.absoluteError, vol.absoluteError,
        `=B${base + 9}*B${base + 8}`,
        `=C${base + 9}*C${base + 8}`, "0.000")
    );
    amoRows.push(
      stat("Erro de amostragem relativo (E %)", ba.relativeError, vol.relativeError,
        `=IFERROR(B${base + 10}/B${base + 2}*100,0)`,
        `=IFERROR(C${base + 10}/C${base + 2}*100,0)`, "0.00")
    );
    amoRows.push([]);
    amoRows.push(["Resultado", "Área basal", "Volume"]);
    amoRows.push(
      stat("Média por parcela", ba.mean, vol.mean,
        `=B${base + 2}`, `=C${base + 2}`, "0.000")
    );
    amoRows.push(
      stat("Erro absoluto (m²/m³)", ba.absoluteError, vol.absoluteError,
        `=B${base + 10}`, `=C${base + 10}`, "0.000")
    );
    amoRows.push(
      stat("Erro relativo (%)", ba.relativeError, vol.relativeError,
        `=B${base + 11}`, `=C${base + 11}`, "0.00")
    );

    appendSheet("Amostragem", amoRows, [28, 14, 14]);
  }

  // ── Estrutura horizontal (fórmulas por parcela, sobre 'Árvores') ──
  if (horizontal.length > 0) {
    const hzRows: SheetRow[] = [
      ["Parcela", "N", "Espécies", "Área basal (m²)", "Espécies (N)"],
    ];
    horizontal.forEach((h, i) => {
      const r = 6 + i;
      hzRows.push([
        h.plotCode,
        F(h.treeCount, `=COUNTIF(${arRng("A")},$A${r})`, "0"),
        F(
          h.speciesCount,
          `=IFERROR(SUMPRODUCT((${arRng("A")}=$A${r})/COUNTIFS(${arRng(
            "C"
          )},${arRng("C")},${arRng("A")},${arRng("A")})),0)`,
          "0"
        ),
        F(
          r3(h.basalAreaM2),
          `=IFERROR(SUMIFS(${arRng("H")},${arRng("A")},$A${r}),0)`,
          "0.000"
        ),
        h.species.map((s) => `${s.name} (${s.count})`).join(", "),
      ]);
    });
    appendSheet("Estrutura horizontal", hzRows, [10, 6, 8, 14, 40]);
  }

  // ── Estrutura vertical (fórmulas por estrato, sobre a aba mestre) ──
  if (vertical.length > 0) {
    const vcRows: SheetRow[] = [
      ["Estrato", "Faixa (m)", "N", "Espécies", "Área basal (m²)", "Espécies (N)"],
    ];
    vertical.forEach((v, i) => {
      const r = 6 + i;
      const k = i + 1;
      vcRows.push([
        v.name,
        `${r2(v.heightMin)} – ${r2(v.heightMax)}`,
        F(v.treeCount, `=COUNTIF(${dcRange("Q")},${k})`, "0"),
        F(
          v.speciesCount,
          `=IFERROR(SUMPRODUCT((${dcRange("Q")}=${k})/COUNTIFS(${dcRange(
            "D"
          )},${dcRange("D")},${dcRange("Q")},${dcRange("Q")})),0)`,
          "0"
        ),
        F(
          r3(v.basalAreaM2),
          `=IFERROR(SUMIFS(${dcRange("J")},${dcRange("Q")},${k}),0)`,
          "0.000"
        ),
        v.species.map((s) => `${s.name} (${s.count})`).join(", "),
      ]);
    });
    appendSheet("Estrutura vertical", vcRows, [10, 12, 6, 8, 14, 40]);
  }

  // ── IVI (abundância / dominância / frequência) ──
  if (ivi.length > 0) {
    const iviFirst = 6;
    const iviLast = iviFirst + ivi.length - 1;
    const iviRows: SheetRow[] = [
      ["Espécie", "N", "Densidade rel. (%)", "Dominância rel. (%)", "Frequência rel. (%)", "IVI"],
    ];
    ivi.forEach((s, i) => {
      const r = iviFirst + i;
      const speciesIn = `(${dcRange("D")}=$A${r})`;
      const freqSpecies = `SUMPRODUCT((${speciesIn}*(${dcRange(
        "O"
      )}<>""))/COUNTIFS(${dcRange("D")},${dcRange("D")},${dcRange("O")},${dcRange("O")}))`;
      const freqTotal = `SUMPRODUCT((${dcRange(
        "O"
      )}<>"")/COUNTIFS(${dcRange("O")},${dcRange("O")}))`;
      iviRows.push([
        s.speciesName,
        F(s.n, `=COUNTIF(${dcRange("D")},$A${r})`, "0"),
        F(
          r2(s.density),
          `=IF(B${r}=0,0,ROUND(B${r}/SUM($B$${iviFirst}:$B$${iviLast})*100,2))`,
          "0.00"
        ),
        F(
          r2(s.dominance),
          `=IFERROR(ROUND(SUMIF(${dcRange("D")},$A${r},${dcRange("J")})/SUM(${dcRange("J")})*100,2),0)`,
          "0.00"
        ),
        F(
          r2(s.frequency),
          `=IFERROR(ROUND(${freqSpecies}/${freqTotal}*100,2),0)`,
          "0.00"
        ),
        F(r2(s.ivi), `=IFERROR(ROUND(C${r}+D${r}+E${r},2),0)`, "0.00"),
      ]);
    });
    appendSheet("IVI", iviRows, [24, 6, 14, 14, 16, 10]);
  }

  // ── Análise CONAMA 05/94 ──
  if (conama) {
    const strataFirst = 8;
    const conamaRows: SheetRow[] = [
      ["Análise CONAMA 05/94 — estágios de regeneração da Mata Atlântica"],
      [],
      ["Estrato", "Faixa (m)", "N", "Espécies", "Área basal (m²)", "Altura média (m)", "DAP médio (cm)", "DAP min–max (cm)", "Estágio"],
    ];
    conama.strata.forEach((st, i) => {
      const r = strataFirst + i;
      const k = i + 1;
      conamaRows.push([
        st.name,
        `${r2(st.heightMin)} – ${r2(st.heightMax)}`,
        F(st.treeCount, `=COUNTIF(${dcRange("Q")},${k})`, "0"),
        F(
          st.speciesCount,
          `=IFERROR(SUMPRODUCT((${dcRange("Q")}=${k})/COUNTIFS(${dcRange(
            "D"
          )},${dcRange("D")},${dcRange("Q")},${dcRange("Q")})),0)`,
          "0"
        ),
        F(
          r3(st.basalAreaM2),
          `=IFERROR(SUMIFS(${dcRange("J")},${dcRange("Q")},${k}),0)`,
          "0.000"
        ),
        F(
          r2(st.avgHeightM),
          `=IFERROR(ROUND(SUMPRODUCT((${dcRange("Q")}=${k})*IF(ISNUMBER(${dcRange(
            "I"
          )}),${dcRange("I")},0))/MAX(1,COUNTIF(${dcRange("Q")},${k})),2),0)`,
          "0.00"
        ),
        F(
          r2(st.avgDapCm),
          `=IFERROR(ROUND(SUMPRODUCT((${dcRange("Q")}=${k})*IF(ISNUMBER(${dcRange(
            "G"
          )}),${dcRange("G")},0))/MAX(1,COUNTIF(${dcRange("Q")},${k})),2),0)`,
          "0.00"
        ),
        FS(
          `${r2(st.minDapCm)} – ${r2(st.maxDapCm)}`,
          `=IFERROR(ROUND(MINIFS(${dcRange("G")},${dcRange("Q")},${k}),2),0)&" – "&IFERROR(ROUND(MAXIFS(${dcRange("G")},${dcRange("Q")},${k}),2),0)`
        ),
        st.stageLabel,
      ]);
    });
    const strataLast = strataFirst + conama.strata.length - 1;
    conamaRows.push([]);
    conamaRows.push(["Indicador", "Valor", ""]);
    conamaRows.push([
      "Nº de estratos",
      F(conama.strataCount, `=COUNT(A${strataFirst}:A${strataLast})`, "0"),
      "",
    ]);
    conamaRows.push([
      "Nº de espécies",
      F(conama.totalSpecies, `=IFERROR(${speciesDistinct},0)`, "0"),
      "",
    ]);
    conamaRows.push([
      "Nº de árvores",
      F(conama.totalTrees, `=COUNT(${arRng("B")})`, "0"),
      "",
    ]);
    conamaRows.push([
      "Área basal (m²)",
      F(r3(conama.basalAreaM2), `=ROUND(SUM(${dcRange("J")}),3)`, "0.000"),
      "",
    ]);
    conamaRows.push([
      "Área basal por ha (m²/ha)",
      F(r3(conama.basalAreaM2 / (conama.areaHa || 1)), `=IF(${PHa}=0,0,ROUND(SUM(${dcRange("J")})/${PHa},3))`, "0.000"),
      "",
    ]);
    conamaRows.push([
      "Altura média (m)",
      F(r2(conama.avgHeightM), `=IFERROR(ROUND(AVERAGEIF(${dcRange("I")},">0"),2),0)`, "0.00"),
      "",
    ]);
    conamaRows.push([
      "DAP médio (cm)",
      F(r2(conama.avgDapCm), `=IFERROR(ROUND(AVERAGEIF(${dcRange("G")},">0"),2),0)`, "0.00"),
      "",
    ]);
    conamaRows.push([
      "Amplitude diamétrica (cm)",
      `${r2(conama.minDapCm)} – ${r2(conama.maxDapCm)}`,
      "",
    ]);
    conamaRows.push([]);
    conamaRows.push([`Atributos por estrato (Resolução CONAMA 05/94):`]);
    conama.strata.forEach((st) => {
      conamaRows.push([]);
      conamaRows.push([`Estrato ${st.name} — ${st.stageLabel}`]);
      st.attributes.forEach((a) => conamaRows.push([a.label, a.value || "—"]));
    });
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

    const florRows: SheetRow[] = [["Família", "Espécie", "Hábito", "Status"]];
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

  // Escreve o workbook e injeta <calcPr fullCalcOnLoad="1"/> para que o Excel
  // recalcule todas as fórmulas ao abrir (as fórmulas dependem de inputs que o
  // usuário edita, ex.: espécie identificada posteriormente por foto).
  const wbout0 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(wbout0, { base64: true });
    const entry = zip.file("xl/workbook.xml");
    const wbxml = entry ? await entry.async("string") : "";
    const patched = wbxml.includes("<calcPr")
      ? wbxml.replace(
          /<calcPr[^>]*>/,
          '<calcPr fullCalcOnLoad="1" calcId="999999"/>'
        )
      : wbxml.replace(
          "</workbook>",
          '<calcPr fullCalcOnLoad="1" calcId="999999"/></workbook>'
        );
    zip.file("xl/workbook.xml", patched);
    return await zip.generateAsync({
      type: "base64",
      compression: "DEFLATE",
    });
  } catch {
    return wbout0;
  }
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