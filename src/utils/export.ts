import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "react-native";
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
import { calcVerticalStructure } from "./structure";
import { calcConama, calcFloristic } from "./conama";
import { buildSamplingReport } from "./sampling";
import { calcSufficiency } from "./sufficiency";

const METHOD_LABEL: Record<string, string> = {
  censo: "Censo",
  parcelas_fixas: "Parcelas fixas",
  pcqm: "PCQM",
  arvores_isoladas: "Árvores isoladas",
};

const sanNum = (n: number) => (Number.isFinite(n) ? n : 0);
const r2 = (n: number) => Math.round(sanNum(n) * 100) / 100;
const r3 = (n: number) => Math.round(sanNum(n) * 1000) / 1000;
const r4 = (n: number) => Math.round(sanNum(n) * 10000) / 10000;

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
  v: sanNum(v),
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
  family: string;
  cap: number;
  hc: number;
  ht: number;
  stemCount: number;
  cond: string;
  lat: number;
  lng: number;
  notes: string;
};

// Gera o relatório Excel em base64 (usado tanto no botão Excel quanto no backup).
// Estratégia: a aba "Dados de campo" concentra os INPUTS editáveis (espécie,
// CAP, Ht, Hc) e as demais abas derivam tudo por fórmulas — assim, corrigir a
// espécie por foto depois reflete em todas as planilhas automaticamente.
// Quando modelOnly=true, mantém somente as 3 abas do modelo oficial
// (Dados de entrada, Instrucoes, Parametros) para importação no software de
// escritório; o backup continua gerando o workbook completo.
export async function buildXlsxBase64(
  project: Project,
  plots: Plot[],
  trees: Tree[],
  species: Species[],
  modelOnly = false
): Promise<string> {
  const XLSX = await import("xlsx");

  const methodLabel = METHOD_LABEL[project.method] || project.method;

  const treeTrees = trees.filter((t) => t.isTree);
  const nonTreeCount = trees.length - treeTrees.length;

  const results = calcPlotResults(treeTrees);
  const shannon = calcShannon(treeTrees);
  const pielou = calcPielou(treeTrees, shannon);
  const ivi = calcIVI(treeTrees);
  const sppLitAll = `{${ivi
    .map((s) => JSON.stringify(s.speciesName))
    .join(",")}}`;
  const plotIdxLit =
    plots.length > 0
      ? `{${plots.map((_, i) => i + 1).join(",")}}`
      : "{0}";
  const sampling =
    project.method === "parcelas_fixas"
      ? buildSamplingReport(project, plots, treeTrees)
      : null;
  const sufficiency = calcSufficiency(treeTrees, project.method, sampling);
  const speciesVolumes = calcSpeciesVolumes(treeTrees);
  const totalVolumes = sumTreeVolumes(treeTrees);
  const areaHa =
    plots.reduce((s, p) => s + (p.areaM2 > 0 ? p.areaM2 : 0), 0) / 10000;
  const fusteDapTrees: Array<Pick<Tree, "dbhCm" | "basalAreaM2" | "capCm">> = [];
  treeTrees.forEach((t) => {
    if (t.fustes && t.fustes.length > 0) {
      t.fustes.forEach((f) => {
        if (f.capCm > 0) fusteDapTrees.push({ capCm: f.capCm, dbhCm: 0, basalAreaM2: 0 });
      });
    } else if (t.capCm > 0) {
      fusteDapTrees.push({ capCm: t.capCm, dbhCm: 0, basalAreaM2: 0 });
    }
  });
  const diametric =
    fusteDapTrees.length > 0
      ? calcDiameterDistribution(fusteDapTrees, areaHa || 1)
      : null;
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
          family: sp?.family || "",
          cap: f.capCm,
          hc: f.heightComercialM,
          ht: f.heightTotalM,
          stemCount: t.stemCount,
          cond: t.phytosanitary,
          lat: t.latitude,
          lng: t.longitude,
          notes: t.notes,
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
        family: sp?.family || "",
        cap: t.capCm,
        hc: t.heightComercialM,
        ht: t.heightTotalM,
        stemCount: t.stemCount,
        cond: t.phytosanitary,
        lat: t.latitude,
        lng: t.longitude,
        notes: t.notes,
      });
    }
  });

  const fusteN = fusteRows.length;
  const fusteBySpp = new Map<string, number>();
  fusteRows.forEach((f) =>
    fusteBySpp.set(f.sci, (fusteBySpp.get(f.sci) || 0) + 1)
  );
  const shannonFustes =
    fusteN > 0
      ? [...fusteBySpp.values()].reduce(
          (s, c) => s - (c / fusteN) * Math.log(c / fusteN),
          0
        )
      : 0;
  const pielouFustes =
    fusteN > 0 && fusteBySpp.size > 1
      ? shannonFustes / Math.log(fusteBySpp.size)
      : 0;

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
      fr.ht > 0 ? fr.ht : "",
      fr.hc > 0 ? fr.hc : "",
      F(r4(gi), `=IF(G${r}="","",ROUND(PI()*(G${r}/200)^2,4))`, "0.0000"),
      F(
        fr.hc > 0 ? r4(vc) : 0,
        `=IF(OR(I${r}="",J${r}=""),"",ROUND(J${r}*I${r}*${PffTora},4))`,
        "0.0000"
      ),
      F(
        fr.ht > 0 ? r4(vt) : 0,
        `=IF(OR(H${r}="",J${r}=""),"",ROUND(J${r}*H${r}*${PffTotal},4))`,
        "0.0000"
      ),
      F(
        fr.ht > 0 ? r4(vl) : 0,
        `=IF(L${r}="","",ROUND(MAX(0,L${r}-IF(K${r}="",0,K${r})),4))`,
        "0.0000"
      ),
      F(fr.hc > 0 ? r2(nt) : 0, `=IF(I${r}="","",ROUND(I${r}/2,2))`, "0.00"),
      fr.plotCode,
      F(
        fr.hc > 0 ? r4(sch) : 0,
        `=IF(OR(G${r}="",I${r}=""),"",ROUND(0.00005*G${r}^1.8*I${r}^0.9,4))`,
        "0.0000"
      ),
      F(
        estrato,
        `=IF(H${r}="","",IF(H${r}<=ROUND(${PMaxH}/3,3),1,IF(H${r}<=ROUND(2*${PMaxH}/3,3),2,3)))`,
        "0"
      ),
      FS(
        `${fr.plotCode}|${fr.num}|${fr.fuste}`,
        `=IF(OR(O${r}="",B${r}="",C${r}=""),"",O${r}&"|"&B${r}&"|"&C${r})`
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
          `=IFERROR(MAX($H$${DFIRST}:$H$${DLAST}),0)`,
          "0.00"
        ),
      ],
      [],
      [
        "P", "Nº", "Fuste", "Nome científico", "Nome comum", "CAP (cm)",
        "DAP (cm)", "Ht (m)", "Hc (m)", "Gi (m²)", "VC (m³)",
        "V total (m³)", "VL (m³)", "Nt (un.)", "Parcela", "V Schumacher (m³)",
        "Estrato", "Chave",
      ],
      ...masterRows,
    ],
    [4, 6, 7, 24, 20, 9, 9, 9, 9, 10, 10, 11, 10, 8, 10, 13, 8, 12]
  );

  // ── Dados de entrada (formato do modelo inventario_florestaldsa.xlsx):
  // uma linha por fuste, mesmas colunas do template oficial, com Ht antes de
  // Hc. Aba sem fórmulas (input) para importação direta no software de escritório.
  const DE_COLS = [
    "Parcela", "Nº arvore", "Nº fuste", "Nome cientifico", "Nome comum",
    "Familia", "CAP (cm)", "Ht (m)", "Hc (m)", "Area da parcela (m2)",
    "UTM X (E)", "UTM Y (N)", "Observacoes",
  ];
  const deRows: (string | number)[][] = [DE_COLS];
  fusteRows.forEach((fr) => {
    const plot = fr.plotIdx > 0 ? plots[fr.plotIdx - 1] : undefined;
    deRows.push([
      plot?.code || fr.plotCode || "",
      fr.num,
      fr.fuste,
      fr.sci,
      fr.com,
      fr.family || "",
      fr.cap > 0 ? fr.cap : "",
      fr.ht > 0 ? fr.ht : "",
      fr.hc > 0 ? fr.hc : "",
      plot && plot.areaM2 > 0 ? plot.areaM2 : "",
      "",
      "",
      fr.notes || "",
    ]);
  });
  const deWs = XLSX.utils.aoa_to_sheet(deRows);
  deWs["!cols"] = [16, 12, 12, 30, 24, 18, 12, 10, 10, 18, 16, 18, 32].map(
    (w) => ({ wch: w })
  );
  deWs["!freeze"] = { xSplit: 0, ySplit: 1 };
  deWs["!autofilter"] = { ref: `A1:M${Math.max(2, deRows.length)}` };
  XLSX.utils.book_append_sheet(wb, deWs, "Dados de entrada");

  // ── Instrucoes (igual ao modelo) ──
  const instRows: string[][] = [
    ["PLANILHA MODELO - INVENTARIO FLORESTAL"],
    [],
    ["Preencha uma linha para cada fuste medido."],
    ["O indivíduo é a arvore: se ela possui 2 fustes, insira o mesmo Nº arvore duas vezes (uma linha por fuste); o software agrupa os fustes da mesma arvore automaticamente."],
    ["A coluna Area da parcela (m2) e usada em amostragem e censo; no corte isolado pode ficar vazia."],
    ["As colunas UTM X (E) e UTM Y (N) sao obrigatorias no modo Corte isolado."],
    ["A coluna Parcela e obrigatória na amostragem e censo; no corte isolado pode ficar vazia."],
    ["Para arvore de fuste unico, use Nº fuste = 1."],
    ["CAP, Ht e Hc devem ser informados em centimetros e metros conforme os cabecalhos."],
    ["Nome cientifico nao pode ficar vazio ou como Nao identificada para exportar resultados."],
    [],
    ["Coluna", "Preenchimento"],
    ["Parcela", "Amostragem/Censo"],
    ["Nº arvore", "Obrigatorio"],
    ["Nº fuste", "Obrigatorio"],
    ["Nome cientifico", "Obrigatorio"],
    ["Nome comum", "Opcional"],
    ["Familia", "Opcional"],
    ["CAP (cm)", "Obrigatorio"],
    ["Ht (m)", "Obrigatorio"],
    ["Hc (m)", "Opcional"],
    ["Area da parcela (m2)", "Amostragem/Censo"],
    ["UTM X (E)", "Corte isolado"],
    ["UTM Y (N)", "Corte isolado"],
    ["Observacoes", "Opcional"],
  ];
  const instWs = XLSX.utils.aoa_to_sheet(instRows);
  instWs["!cols"] = [34, 24].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, instWs, "Instrucoes");

  // ── Parametros (aba usada pelo software de escritório: área amostrada =
  // soma das áreas das parcelas na amostragem casual simples; área total do
  // projeto = área preenchida do projeto) ──
  const paramRows: SheetRow[] = [
    ["Parametro", "Valor"],
    ["Area amostrada (ha)", r3(areaHa)],
    ["Area total do projeto (ha)", project.areaHa || 0],
    ["Fator de forma - tora", FF_VOLUME_TORA],
    ["Fator de forma - volume total", FF_VOLUME_TOTAL],
    ["Confianca (%)", 90],
    ["Erro maximo (%)", 20],
  ];
  const paramWs = XLSX.utils.aoa_to_sheet(paramRows);
  paramWs["!cols"] = [34, 16].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, paramWs, "Parametros");

  // ── Árvores (uma linha por fuste — multifuste duplica a árvore com os dados
  // de cada fuste; fórmulas que agregam a aba mestre pela Chave) ──
  const AR_FIRST = 6;
  const AR_LAST =
    fusteRows.length > 0 ? AR_FIRST + fusteRows.length - 1 : AR_FIRST;
  const arRng = (c: string) => `'Árvores'!${c}$${AR_FIRST}:${c}$${AR_LAST}`;

  const ATreeCols: string[] = [
    "Parcela", "Nº Árvore", "Fuste", "Espécie", "CAP (cm)", "DAP (cm)",
    "Altura total (m)", "Altura comercial (m)", "Área basal (m²)",
    "Fustes", "Vol tora (m³)", "Vol total (m³)", "Vol lenha (m³)",
    "Condição", "Latitude", "Longitude", "Observações", "Chave",
  ];
  const atreeRows: SheetRow[] = [];
  fusteRows.forEach((fr, i) => {
    const row = AR_FIRST + i;
    const key = `$R${row}`;
    const dap = capToDbh(fr.cap);
    const gi = (Math.PI * dap * dap) / 40000;
    const vc = fr.hc > 0 ? gi * fr.hc * FF_VOLUME_TORA : 0;
    const vt = fr.ht > 0 ? gi * fr.ht * FF_VOLUME_TOTAL : 0;
    const vl = fr.ht > 0 ? Math.max(0, vt - vc) : 0;
    atreeRows.push([
      fr.plotCode,
      fr.num,
      fr.fuste,
      FS(
        fr.sci,
        `=IFERROR(INDEX(${dcRange("D")},MATCH(${key},${dcRange("R")},0)),"")`
      ),
      F(
        r2(fr.cap),
        `=IFERROR(SUMIFS(${dcRange("F")},${dcRange("R")},${key}),0)`,
        "0.00"
      ),
      F(
        r2(dap),
        `=IFERROR(ROUND(SQRT(SUMPRODUCT((${dcRange("R")}=${key})*(${dcRange("G")}^2))),2),0)`,
        "0.00"
      ),
      F(
        fr.ht > 0 ? r2(fr.ht) : 0,
        `=IFERROR(SUMIFS(${dcRange("H")},${dcRange("R")},${key}),0)`,
        "0.00"
      ),
      F(
        fr.hc > 0 ? r2(fr.hc) : 0,
        `=IFERROR(SUMIFS(${dcRange("I")},${dcRange("R")},${key}),0)`,
        "0.00"
      ),
      F(
        r3(gi),
        `=IFERROR(SUMIFS(${dcRange("J")},${dcRange("R")},${key}),0)`,
        "0.000"
      ),
      fr.stemCount,
      F(
        r3(vc),
        `=IFERROR(SUMIFS(${dcRange("K")},${dcRange("R")},${key}),0)`,
        "0.000"
      ),
      F(
        r3(vt),
        `=IFERROR(SUMIFS(${dcRange("L")},${dcRange("R")},${key}),0)`,
        "0.000"
      ),
      F(
        r3(vl),
        `=IFERROR(SUMIFS(${dcRange("M")},${dcRange("R")},${key}),0)`,
        "0.000"
      ),
      fr.cond,
      fr.lat,
      fr.lng,
      fr.notes,
      FS(
        `${fr.plotCode}|${fr.num}|${fr.fuste}`,
        `=IF(OR($A${row}="",$B${row}="",$C${row}=""),"",$A${row}&"|"&$B${row}&"|"&$C${row})`
      ),
    ]);
  });
  appendSheet(
    "Árvores",
    [ATreeCols, ...atreeRows],
    [10, 9, 7, 24, 10, 10, 12, 12, 10, 7, 10, 10, 10, 12, 10, 10, 24, 16]
  );

  // ── Fustes (subconjunto da aba mestre, fórmulas de referência) ──
  if (fusteRows.length > 0) {
    const stemCols = [
      "Parcela", "Nº Árvore", "Fuste", "CAP (cm)", "DAP (cm)",
      "Altura total (m)", "Altura comercial (m)", "Área basal (m²)",
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
        F(fr.ht > 0 ? r2(fr.ht) : 0, `='${DC}'!H${r}`, "0.00"),
        F(fr.hc > 0 ? r2(fr.hc) : 0, `='${DC}'!I${r}`, "0.00"),
        F(r3(gi), `='${DC}'!J${r}`, "0.000"),
      ];
    });
    appendSheet("Fustes", [stemCols, ...stemRows], [10, 9, 7, 10, 10, 12, 12, 10]);
  }

  // ── Resumo ──
  const speciesDistinct = `SUMPRODUCT(--(COUNTIFS(${dcRange(
    "D"
  )},${sppLitAll})>0))`;
  const shannonFormula = `IFERROR(-SUMPRODUCT((COUNTIF(${dcRange(
    "D"
  )},${sppLitAll})/MAX(1,COUNTA(${dcRange(
    "D"
  )})))*LN(COUNTIF(${dcRange("D")},${sppLitAll})/MAX(1,COUNTA(${dcRange(
    "D"
  )})))),0)`;
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
    F(treeTrees.length, `=COUNTIF(${dcRange("C")},1)`, "0"),
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
      `=IFERROR(ROUND(AVERAGEIF(${dcRange("H")},">0"),2),0)`,
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
    F(r3(shannonFustes), `=${shannonFormula}`, "0.000"),
  ]);
  resumoRows.push([
    "Pielou (J')",
    F(r3(pielouFustes), `=IFERROR($B$${shannonRow}/LN(MAX(1,${speciesDistinct})),0)`, "0.000"),
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
          `=IFERROR(COUNTIFS(${arRng("F")},">="&B${r},${arRng("F")},"${op}"&C${r}),0)`,
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
          `=IFERROR(ROUND(AVERAGE(${arRng("F")}),2),0)`,
          "0.00"
        ),
      ],
      [
        FS("Mínimo DAP (cm)", ""),
        "",
        "",
        F(
          r2(diametric.minDap),
          `=IFERROR(MIN(${arRng("F")}),0)`,
          "0.00"
        ),
      ],
      [
        FS("Máximo DAP (cm)", ""),
        "",
        "",
        F(
          r2(diametric.maxDap),
          `=IFERROR(MAX(${arRng("F")}),0)`,
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
      "Ht (m)", "Hc (m)", "Gi (m²)", "VC (m³)", "VL (m³)", "Nt (un.)",
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
        F(fr.ht > 0 ? r2(fr.ht) : 0, `='${DC}'!H${r}`, "0.00"),
        F(fr.hc > 0 ? r2(fr.hc) : 0, `='${DC}'!I${r}`, "0.00"),
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
    const htMax = `=IFERROR(MAX(${dcRange("H")}),0)`;
    const htMin = `=IFERROR(MINIFS(${dcRange("H")},${dcRange("H")},">0"),0)`;

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
        F(treeTrees.length, `=COUNTIF(${dcRange("C")},1)`, "0"),
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

  // ── Estrutura horizontal (fitossociologia por espécie, sobre a aba mestre) ──
  if (ivi.length > 0) {
    // Agregação por espécie na aba mestre (n = fustes, gi = área basal do fuste).
    const giOf = (cap: number) =>
      cap > 0 ? (cap * cap) / (Math.PI * 40000) : 0;
    const spAgg = new Map<
      string,
      { n: number; gi: number; plots: Set<number> }
    >();
    fusteRows.forEach((fr) => {
      const cur = spAgg.get(fr.sci) || { n: 0, gi: 0, plots: new Set<number>() };
      cur.n += 1;
      cur.gi += giOf(fr.cap);
      if (fr.plotIdx > 0) cur.plots.add(fr.plotIdx);
      spAgg.set(fr.sci, cur);
    });
    const giTotal = [...spAgg.values()].reduce((s, a) => s + a.gi, 0);
    const faTotal = [...spAgg.values()].reduce((s, a) => s + a.plots.size, 0);
    const nFustes = fusteRows.length;

    const hzFirst = 7;
    const hzLast = hzFirst + ivi.length - 1;
    const hzRows: SheetRow[] = [
      ["Estrutura horizontal (fitossociologia)", "", "", "", "", "", "", "", "", "", "", ""],
      [
        "Espécie", "N", "DA (n/ha)", "DR (%)", "DoA (m²/ha)", "DoR (%)",
        "FA", "FR (%)", "VC", "VC (%)", "VI", "VI (%)",
      ],
    ];
    ivi.forEach((s, i) => {
      const r = hzFirst + i;
      const agg = spAgg.get(s.speciesName) || { n: 0, gi: 0, plots: new Set<number>() };
      const n = agg.n;
      const da = areaHa > 0 ? n / areaHa : 0;
      const dr = nFustes > 0 ? (n / nFustes) * 100 : 0;
      const doA = areaHa > 0 ? agg.gi / areaHa : 0;
      const doR = giTotal > 0 ? (agg.gi / giTotal) * 100 : 0;
      const fa = plots.length > 0 ? agg.plots.size / plots.length : 0;
      const fr = faTotal > 0 ? (agg.plots.size / faTotal) * 100 : 0;
      const vc = dr + doR;
      const vi = dr + doR + fr;
      const spIn = `(${dcRange("D")}=$A${r})`;
      hzRows.push([
        s.speciesName,
        F(n, `=COUNTIF(${dcRange("D")},$A${r})`, "0"),
        F(r2(da), `=IFERROR(B${r}/${PHa},0)`, "0.00"),
        F(r2(dr), `=IF(B${r}=0,0,ROUND(B${r}/SUM($B$${hzFirst}:$B$${hzLast})*100,2))`, "0.00"),
        F(r2(doA), `=IFERROR(SUMIF(${dcRange("D")},$A${r},${dcRange("J")})/${PHa},0)`, "0.00"),
        F(r2(doR), `=IFERROR(ROUND(E${r}/SUM($E$${hzFirst}:$E$${hzLast})*100,2),0)`, "0.00"),
        F(
          r2(fa),
          `=IFERROR(ROUND(SUMPRODUCT(--(COUNTIFS(${dcRange("D")},$A${r},${dcRange("A")},${plotIdxLit})>0))/${Math.max(
            1,
            plots.length
          )},2),0)`,
          "0.00"
        ),
        F(r2(fr), `=IF(G${r}=0,0,ROUND(G${r}/SUM($G$${hzFirst}:$G$${hzLast})*100,2))`, "0.00"),
        F(r2(vc), `=ROUND(D${r}+F${r},2)`, "0.00"),
        F(r2(vc / 2), `=ROUND(I${r}/2,2)`, "0.00"),
        F(r2(vi), `=ROUND(D${r}+F${r}+H${r},2)`, "0.00"),
        F(r2(vi / 3), `=ROUND(K${r}/3,2)`, "0.00"),
      ]);
    });
    hzRows.push([
      "DA = N/área amostrada • DR = N/ΣN×100 • DoA = ΣGi/área amostrada • DoR = Gi/ΣGi×100 • FA = fração de parcelas com a espécie (0–1) • FR = FA/ΣFA×100 • VC = DR+DoR • VC (%) = VC/2 • VI = DR+DoR+FR • VI (%) = VI/3", "", "", "", "", "", "", "", "", "", "", "",
    ]);
    const plotAgg = new Map<
      number,
      { code: string; n: number; gi: number; spp: Map<string, number> }
    >();
    fusteRows.forEach((f) => {
      if (f.plotIdx <= 0) return;
      let p = plotAgg.get(f.plotIdx);
      if (!p) {
        p = { code: f.plotCode, n: 0, gi: 0, spp: new Map() };
        plotAgg.set(f.plotIdx, p);
      }
      p.n += 1;
      const d = capToDbh(f.cap);
      p.gi += (Math.PI * d * d) / 40000;
      p.spp.set(f.sci, (p.spp.get(f.sci) || 0) + 1);
    });
    const hzPlotList = [...plotAgg.entries()].sort((a, b) => a[0] - b[0]);
    if (hzPlotList.length > 0) {
      hzRows.push([], ["Estrutura horizontal por parcela", "", "", "", ""]);
      hzRows.push(["Parcela", "N (fustes)", "Espécies", "Área basal (m²)", "Espécies (N)"]);
      const prBase = hzRows.length + 5;
      hzPlotList.forEach(([pIdx, p], i) => {
        const pr = prBase + i;
        const sppPlotLit = `{${[...p.spp.keys()]
          .map((n) => JSON.stringify(n))
          .join(",")}}`;
        hzRows.push([
          p.code,
          F(p.n, `=COUNTIF(${arRng("A")},$A${pr})`, "0"),
          F(
            p.spp.size,
            `=IFERROR(SUMPRODUCT(--(COUNTIFS(${dcRange("D")},${sppPlotLit},${dcRange("A")},${pIdx})>0)),0)`,
            "0"
          ),
          F(
            r3(p.gi),
            `=IFERROR(SUMIFS(${arRng("I")},${arRng("A")},$A${pr}),0)`,
            "0.000"
          ),
          [...p.spp.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([n, c]) => `${n} (${c})`)
            .join(", "),
        ]);
      });
    }
    appendSheet("Estrutura horizontal", hzRows, [46, 8, 12, 12, 14, 12, 8, 12, 12, 12, 12, 12]);
  }

  // ── Estrutura vertical (posição sociológica por espécie — FINOL, 1971) ──
  if (ivi.length > 0) {
    const maxH3 = maxHeight / 3;
    const faixaI = maxH3 > 0 ? `0 – ${r2(maxH3)}` : "0 – 0";
    const faixaM = maxH3 > 0 ? `${r2(maxH3)} – ${r2(2 * maxH3)}` : "0 – 0";
    const faixaS = maxH3 > 0 ? `> ${r2(2 * maxH3)}` : "> 0";

    const estratoOf = (ht: number) =>
      ht > 0 ? (ht <= maxH3 ? 1 : ht <= 2 * maxH3 ? 2 : 3) : 0;
    const strataCounts = [0, 0, 0];
    const perSpecies = new Map<string, number[]>();
    fusteRows.forEach((fr) => {
      const es = estratoOf(fr.ht);
      if (es === 0) return;
      strataCounts[es - 1] += 1;
      const arr = perSpecies.get(fr.sci) || [0, 0, 0];
      arr[es - 1] += 1;
      perSpecies.set(fr.sci, arr);
    });
    const nTotal = strataCounts.reduce((s, x) => s + x, 0);

    const vSpFirst = 13;
    const vSpLast = vSpFirst + ivi.length - 1;
    const vcRows: SheetRow[] = [
      ["Estrato", "Faixa (m)", "N (indivíduos)", "", "VFj (%)"],
      [
        "Inferior", faixaI,
        F(strataCounts[0], `=COUNTIF(${dcRange("Q")},1)`, "0"),
        "",
        F(r2(nTotal ? (strataCounts[0] / nTotal) * 100 : 0), `=IF($C$9=0,0,ROUND($C$6/$C$9*100,1))`, "0.0"),
      ],
      [
        "Médio", faixaM,
        F(strataCounts[1], `=COUNTIF(${dcRange("Q")},2)`, "0"),
        "",
        F(r2(nTotal ? (strataCounts[1] / nTotal) * 100 : 0), `=IF($C$9=0,0,ROUND($C$7/$C$9*100,1))`, "0.0"),
      ],
      [
        "Superior", faixaS,
        F(strataCounts[2], `=COUNTIF(${dcRange("Q")},3)`, "0"),
        "",
        F(r2(nTotal ? (strataCounts[2] / nTotal) * 100 : 0), `=IF($C$9=0,0,ROUND($C$8/$C$9*100,1))`, "0.0"),
      ],
      ["Total", "", F(nTotal, `=SUM($C$6:$C$8)`, "0"), "", F(100, `=SUM($E$6:$E$8)`, "0.0")],
      [],
      ["Posição sociológica (FINOL, 1971)", "", "", "", "", "", "", "", "", "", "", ""],
      [
        "Espécie", "N Inferior", "N Médio", "N Superior",
        "DAij Inferior (n/ha)", "DAij Médio (n/ha)", "DAij Superior (n/ha)",
        "Vfij Inferior (%)", "Vfij Médio (%)", "Vfij Superior (%)", "PSAi", "PSRi (%)",
      ],
    ];
    const psaTotal = ivi.reduce((s, sp) => {
      const cnt = perSpecies.get(sp.speciesName) || [0, 0, 0];
      const ni = cnt.reduce((a, b) => a + b, 0);
      return s + (nTotal > 0 ? (ni / nTotal) * 100 : 0);
    }, 0);
    ivi.forEach((sp, i) => {
      const r = vSpFirst + i;
      const cnt = perSpecies.get(sp.speciesName) || [0, 0, 0];
      const ni = cnt.reduce((a, b) => a + b, 0);
      const da = (k: number) => (areaHa > 0 ? cnt[k] / areaHa : 0);
      const vf = (k: number) =>
        strataCounts[k] > 0 ? (cnt[k] / strataCounts[k]) * 100 : 0;
      const psa = nTotal > 0 ? (ni / nTotal) * 100 : 0;
      const psr = psaTotal > 0 ? (psa / psaTotal) * 100 : 0;
      vcRows.push([
        sp.speciesName,
        F(cnt[0], `=COUNTIFS(${dcRange("D")},$A${r},${dcRange("Q")},1)`, "0"),
        F(cnt[1], `=COUNTIFS(${dcRange("D")},$A${r},${dcRange("Q")},2)`, "0"),
        F(cnt[2], `=COUNTIFS(${dcRange("D")},$A${r},${dcRange("Q")},3)`, "0"),
        F(r2(da(0)), `=IFERROR(B${r}/${PHa},0)`, "0.00"),
        F(r2(da(1)), `=IFERROR(C${r}/${PHa},0)`, "0.00"),
        F(r2(da(2)), `=IFERROR(D${r}/${PHa},0)`, "0.00"),
        F(r2(vf(0)), `=IF($C$6=0,0,ROUND(B${r}/$C$6*100,1))`, "0.0"),
        F(r2(vf(1)), `=IF($C$7=0,0,ROUND(C${r}/$C$7*100,1))`, "0.0"),
        F(r2(vf(2)), `=IF($C$8=0,0,ROUND(D${r}/$C$8*100,1))`, "0.0"),
        F(r3(psa), `=IFERROR(ROUND((H${r}*$E$6+I${r}*$E$7+J${r}*$E$8)/100,3),0)`, "0.000"),
        F(r2(psr), `=IFERROR(ROUND(K${r}/SUM($K$${vSpFirst}:$K$${vSpLast})*100,2),0)`, "0.00"),
      ]);
    });
    appendSheet("Estrutura vertical", vcRows, [32, 14, 12, 12, 20, 20, 20, 15, 15, 16, 10, 10]);
  }

  // ── Índices de diversidade por parcela (Shannon-Wiener, Pielou e Simpson) ──
  if (fusteRows.length > 0) {
    const codeByIdx = new Map(plots.map((p, i) => [i + 1, p.code]));
    const perPlot = new Map<number, { code: string; spp: Map<string, number> }>();
    fusteRows.forEach((fr) => {
      if (fr.plotIdx <= 0) return;
      let pp = perPlot.get(fr.plotIdx);
      if (!pp) {
        pp = { code: codeByIdx.get(fr.plotIdx) || `P${fr.plotIdx}`, spp: new Map() };
        perPlot.set(fr.plotIdx, pp);
      }
      pp.spp.set(fr.sci, (pp.spp.get(fr.sci) || 0) + 1);
    });
    const sortedPlots = [...perPlot.entries()].sort((a, b) => a[0] - b[0]);
    if (sortedPlots.length > 0) {
      const divRows: SheetRow[] = [
        ["Índices de diversidade por parcela — indivíduos = fustes da aba 'Dados de campo'. Edite os dados na aba mestre e estes índices recalculam ao abrir o arquivo.", "", "", "", "", ""],
      ];
      for (const [plotIdx, pp] of sortedPlots) {
        const spp = [...pp.spp.entries()].sort((a, b) => b[1] - a[1]);
        const plotN = spp.reduce((s, [, n]) => s + n, 0);
        const S = spp.length;
        const piOf = (n: number) => (plotN > 0 ? n / plotN : 0);
        const H = -spp.reduce((s, [, n]) => {
          const p = piOf(n);
          return s + (p > 0 ? p * Math.log(p) : 0);
        }, 0);
        const J = S > 1 && H > 0 ? H / Math.log(S) : 0;
        const D = spp.reduce((s, [, n]) => s + piOf(n) ** 2, 0);

        divRows.push([]);
        divRows.push([`Parcela ${pp.code}`, "", "", "", "", ""]);
        divRows.push(["Espécie", "ni", "pi", "pi·Ln(pi)", "ni·(ni−1)", "pi²"]);

        const first = divRows.length + 5;
        spp.forEach(([name, ni]) => {
          const r = divRows.length + 5;
          divRows.push([
            name,
            F(ni, `=COUNTIFS(${dcRange("D")},$A${r},${dcRange("A")},${plotIdx})`, "0"),
            F(r4(piOf(ni)), `=IF($B$${first + spp.length}=0,0,ROUND($B${r}/$B$${first + spp.length},4))`, "0.0000"),
            F(r4(piOf(ni) > 0 ? piOf(ni) * Math.log(piOf(ni)) : 0), `=IF($C${r}<=0,0,ROUND($C${r}*LN($C${r}),4))`, "0.0000"),
            F(ni * (ni - 1), `=IF($B${r}<=0,0,$B${r}*($B${r}-1))`, "0"),
            F(r4(piOf(ni) ** 2), `=ROUND($C${r}^2,4)`, "0.0000"),
          ]);
        });
        const last = first + spp.length - 1;
        const rt = last + 1;
        const rH = rt + 1;
        const rS = rt + 4;
        divRows.push([
          "TOTAL",
          F(plotN, `=SUM($B$${first}:$B$${last})`, "0"),
          "",
          F(r4(-H), `=SUM($D$${first}:$D$${last})`, "0.0000"),
          F(spp.reduce((s, [, n]) => s + n * (n - 1), 0), `=SUM($E$${first}:$E$${last})`, "0"),
          F(r4(D), `=SUM($F$${first}:$F$${last})`, "0.0000"),
        ]);
        divRows.push([`H' (Shannon-Wiener)`, F(r4(H), `=IFERROR(ROUND(-$D$${rt},4),0)`, "0.0000"), "", "", "", ""]);
        divRows.push([`H' máx = Ln(S)`, F(r4(S > 1 ? Math.log(S) : 0), `=IFERROR(ROUND(LN($B$${rS}),4),0)`, "0.0000"), "", "", "", ""]);
        divRows.push([`J' (Pielou) = H'/H' máx`, F(r4(J), `=IFERROR(ROUND($B$${rH}/LN($B$${rS}),4),0)`, "0.0000"), "", "", "", ""]);
        divRows.push([`S (nº de espécies)`, F(S, `=SUMPRODUCT(--($B$${first}:$B$${last}>0))`, "0"), "", "", "", ""]);
        divRows.push([`D (Simpson) = Σ pi²`, F(r4(D), `=$F$${rt}`, "0.0000"), "", "", "", ""]);
        divRows.push([`1 − D (inverso de dominância)`, F(r4(1 - D), `=ROUND(1-$F$${rt},4)`, "0.0000"), "", "", "", ""]);
      }
      appendSheet("Índices de diversidade", divRows, [42, 10, 12, 14, 14, 12]);
    }
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
      const freqSpecies = `SUMPRODUCT(--(COUNTIFS(${dcRange(
        "D"
      )},$A${r},${dcRange("A")},${plotIdxLit})>0))`;
      const freqTotal = `SUMPRODUCT(--(COUNTIFS(${dcRange(
        "A"
      )},${plotIdxLit})>0))`;
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
          `=IFERROR(SUMPRODUCT(--(COUNTIFS(${dcRange(
            "D"
          )},${sppLitAll},${dcRange("Q")},${k})>0)),0)`,
          "0"
        ),
        F(
          r3(st.basalAreaM2),
          `=IFERROR(SUMIFS(${dcRange("J")},${dcRange("Q")},${k}),0)`,
          "0.000"
        ),
        F(
          r2(st.avgHeightM),
          `=IFERROR(ROUND(SUMPRODUCT((${dcRange("Q")}=${k})*${dcRange("H")})/MAX(1,COUNTIF(${dcRange("Q")},${k})),2),0)`,
          "0.00"
        ),
        F(
          r2(st.avgDapCm),
          `=IFERROR(ROUND(SUMPRODUCT((${dcRange("Q")}=${k})*${dcRange("G")})/MAX(1,COUNTIF(${dcRange("Q")},${k})),2),0)`,
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
      F(conama.strataCount, `=COUNTA(A${strataFirst}:A${strataLast})`, "0"),
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
      F(r2(conama.avgHeightM), `=IFERROR(ROUND(AVERAGEIF(${dcRange("H")},">0"),2),0)`, "0.00"),
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

  // Formato do modelo oficial: apenas as 3 abas necessárias para o software
  // de escritório (Dados de entrada, Instrucoes, Parametros).
  if (modelOnly) {
    const keep: string[] = ["Dados de entrada", "Instrucoes", "Parametros"];
    wb.SheetNames.forEach((name) => {
      if (!keep.includes(name)) delete wb.Sheets[name];
    });
    wb.SheetNames = keep;
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

// Exporta o relatório Excel no formato do modelo (3 abas: Dados de entrada,
// Instrucoes e Parametros) e abre a folha de compartilhamento.
export async function exportXlsx(
  project: Project,
  plots: Plot[],
  trees: Tree[],
  species: Species[]
) {
  const wbout = await buildXlsxBase64(project, plots, trees, species, true);
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

// Lista as fotos do projeto com nomes legíveis (PROJETO_PARCELA_NUMEROARVORE).
// Só metadados: o conteúdo é lido uma foto por vez na hora de montar o ZIP,
// para não estourar a memória em projetos com muitas imagens.
export interface ProjectImage {
  name: string;
  uri: string;
  caption: string;
  treeUuid: string;
}

export function listProjectImages(
  project: Project,
  plots: Plot[],
  trees: Tree[]
): ProjectImage[] {
  const plotByTree: Record<string, Plot> = {};
  plots.forEach((p) => {
    plotByTree[p.id] = p;
  });

  const projectName = sanitizeFileName(project.name);
  const files: ProjectImage[] = [];

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
      files.push({
        name: `${base}${photoUris.length > 1 ? `_${i + 1}` : ""}.jpg`,
        uri: photoUris[i].uri,
        caption: photoUris[i].caption,
        treeUuid: t.id,
      });
    }
  }
  return files;
}

// Lê uma foto por vez, usando uma compressão leve e limite maior de resolução
// para não degradar as imagens exportadas.
async function readImageForZip(file: ProjectImage): Promise<string | null> {
  try {
    const size = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        Image.getSize(file.uri, (width, height) => resolve({ width, height }), reject);
      }
    );
    const maxDim = Math.max(size.width, size.height);
    if (maxDim <= 2048) {
      return await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
    const scale = 2048 / maxDim;
    const out = await ImageManipulator.manipulateAsync(
      file.uri,
      [
        {
          resize: {
            width: Math.round(size.width * scale),
            height: Math.round(size.height * scale),
          },
        },
      ],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    return await FileSystem.readAsStringAsync(out.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    try {
      return await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      return null;
    }
  }
}

// Adiciona as fotos ao ZIP uma de cada vez e devolve os nomes que entraram.
export async function addProjectImagesToZip(
  zip: any,
  images: ProjectImage[],
  folder = ""
): Promise<Set<string>> {
  const added = new Set<string>();
  for (const img of images) {
    const b64 = await readImageForZip(img);
    if (!b64) continue;
    zip.file(`${folder}${img.name}`, b64, { base64: true });
    added.add(img.name);
  }
  return added;
}

// Tipagem mínima para carregar a API nova do expo-file-system em runtime
// (os tipos dela não compilam com a versão de TypeScript deste projeto).
declare const require: (id: string) => any;

// Grava o ZIP direto no disco em blocos (streaming), evitando montar o arquivo
// inteiro em base64 na memória — era a causa do OutOfMemoryError em projetos
// com muitas fotos. Se a API nova não estiver disponível, usa o método antigo.
export async function writeZipToFile(zip: any, uri: string): Promise<void> {
  try {
    const { File } = require("expo-file-system/next");
    const target = new File(uri);
    if (target.exists) target.delete();
    target.create();
    const handle = target.open();
    try {
      await new Promise<void>((resolve, reject) => {
        zip
          .generateInternalStream({ type: "uint8array", compression: "STORE" })
          .on("data", (chunk: Uint8Array) => {
            handle.writeBytes(chunk);
          })
          .on("error", (e: any) => reject(e))
          .on("end", () => resolve())
          .resume();
      });
    } finally {
      handle.close();
    }
  } catch {
    const b64 = await zip.generateAsync({ type: "base64", compression: "STORE" });
    await FileSystem.writeAsStringAsync(uri, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
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

  const images = listProjectImages(project, plots, trees);
  if (images.length === 0) return false;

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

  const added = await addProjectImagesToZip(zip, images);
  added.forEach((name) => readme.push(name));

  readme.push("", `Total de imagens: ${added.size}`);
  zip.file("README.txt", readme.join("\n"));

  const uri =
    FileSystem.documentDirectory + `${projectName}_IMAGENS.zip`;
  await writeZipToFile(zip, uri);
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
