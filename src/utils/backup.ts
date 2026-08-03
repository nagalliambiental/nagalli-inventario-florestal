import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { Species } from "../types";
import {
  getProject,
  listPlots,
  listTrees,
  listSpecies,
  createProject,
  createPlot,
  createTree,
  addTreePhoto,
} from "../db/database";
import { PHOTOS_DIR } from "./photos";

const FORMAT = "nagalli-project-backup";
const VERSION = 1;

interface BackupTreePhoto {
  ref: string;
  caption: string;
}

interface BackupTree {
  number: number;
  speciesName: string;
  isTree: boolean;
  capCm: number;
  heightComercialM: number;
  heightTotalM: number;
  dbhCm: number;
  basalAreaM2: number;
  stemCount: number;
  phytosanitary: string;
  notes: string;
  latitude: number;
  longitude: number;
  measuredAt: string;
  fustes: {
    number: number;
    capCm: number;
    heightComercialM: number;
    heightTotalM: number;
    dbhCm: number;
    basalAreaM2: number;
  }[];
  photos: BackupTreePhoto[];
}

interface BackupPlot {
  code: string;
  areaM2: number;
  shape: string;
  coordinates: string;
  notes: string;
  trees: BackupTree[];
}

interface BackupManifest {
  format: string;
  version: number;
  exportedAt: string;
  project: {
    name: string;
    client: string;
    location: string;
    method: string;
    areaHa: number;
  };
  plots: BackupPlot[];
}

const sanitizeFileName = (name: string): string =>
  name.replace(/[\\/:*?"<>|]/g, "_").trim() || "projeto";

// Gera o backup completo do projeto (dados + fotos) em um único .zip
// para ser enviado a outro celular que tenha o app instalado.
export async function exportProjectBackup(projectId: string): Promise<boolean> {
  const project = await getProject(projectId);
  if (!project) return false;

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const plots = await listPlots(projectId);
  const manifest: BackupManifest = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    project: {
      name: project.name,
      client: project.client,
      location: project.location,
      method: project.method,
      areaHa: project.areaHa,
    },
    plots: [],
  };

  let photoIndex = 0;
  const extOf = (uri: string) => (uri.toLowerCase().endsWith(".png") ? ".png" : ".jpg");

  for (const plot of plots) {
    const trees = await listTrees(plot.id);
    const backupTrees: BackupTree[] = [];
    for (const t of trees) {
      const photoRefs: BackupTreePhoto[] = [];
      const photoUris: string[] = [];
      if (t.photos && t.photos.length > 0) {
        photoUris.push(...t.photos.map((p) => p.uri));
      } else if (t.photoUri) {
        photoUris.push(t.photoUri);
      }

      const photoCaptions = new Map<string, string>();
      (t.photos || []).forEach((p) => photoCaptions.set(p.uri, p.caption || ""));

      for (const uri of photoUris) {
        const ref = `photos/${photoIndex++}${extOf(uri)}`;
        try {
          const b64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          zip.file(ref, b64, { base64: true });
          photoRefs.push({ ref, caption: photoCaptions.get(uri) || "" });
        } catch {}
      }

      backupTrees.push({
        number: t.number,
        speciesName: t.speciesName,
        isTree: t.isTree,
        capCm: t.capCm,
        heightComercialM: t.heightComercialM,
        heightTotalM: t.heightTotalM,
        dbhCm: t.dbhCm,
        basalAreaM2: t.basalAreaM2,
        stemCount: t.stemCount,
        phytosanitary: t.phytosanitary,
        notes: t.notes,
        latitude: t.latitude,
        longitude: t.longitude,
        measuredAt: t.measuredAt,
        fustes: (t.fustes || []).map((f) => ({
          number: f.number,
          capCm: f.capCm,
          heightComercialM: f.heightComercialM,
          heightTotalM: f.heightTotalM,
          dbhCm: f.dbhCm,
          basalAreaM2: f.basalAreaM2,
        })),
        photos: photoRefs,
      });
    }
    manifest.plots.push({
      code: plot.code,
      areaM2: plot.areaM2,
      shape: plot.shape,
      coordinates: plot.coordinates,
      notes: plot.notes,
      trees: backupTrees,
    });
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const readme = [
    "NAGALLI AMBIENTAL — BACKUP DE PROJETO",
    "",
    `Projeto: ${project.name}`,
    `Exportado em: ${manifest.exportedAt}`,
    `Parcelas: ${manifest.plots.length}`,
    "",
    "Este arquivo pode ser importado em outro aparelho com o app:",
    "Tela inicial → Importar → Backup do projeto (.zip)",
    "",
    "© Nagalli Ambiental Ltda. Direitos reservados. Proibida a cópia e/ou",
    "distribuição total ou parcial deste acervo, por qualquer meio, inclusive",
    "por ferramentas de Inteligência Artificial (Lei nº 9.610/98 e Lei nº 13.709/18).",
    "",
  ];
  zip.file("LEIA-ME.txt", readme.join("\n"));

  const b64 = await zip.generateAsync({
    type: "base64",
    compression: "STORE",
  });
  const uri =
    FileSystem.documentDirectory + `BACKUP_${sanitizeFileName(project.name)}.zip`;
  await FileSystem.writeAsStringAsync(uri, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await Sharing.shareAsync(uri, { mimeType: "application/zip" });
  return true;
}

// Restaura um projeto inteiro (dados + fotos) a partir de um .zip de backup.
// Retorna o id do novo projeto criado no aparelho de destino.
export async function importProjectBackup(uri: string): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const zip = await JSZip.loadAsync(b64, { base64: true });

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("Arquivo de backup inválido (sem manifest.json).");
  }
  const manifest: BackupManifest = JSON.parse(await manifestFile.async("text"));
  if (manifest.format !== FORMAT) {
    throw new Error("Arquivo não reconhecido como backup do app.");
  }

  await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true }).catch(
    () => {}
  );

  const readPhoto = async (ref: string): Promise<string | null> => {
    const file = zip.file(ref);
    if (!file) return null;
    const data = await file.async("base64");
    if (!data) return null;
    const name = ref.split("/").pop() || `${Date.now()}.jpg`;
    const dest = `${PHOTOS_DIR}imp_${Date.now()}_${name}`;
    await FileSystem.writeAsStringAsync(dest, data, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return dest;
  };

  const projectId = await createProject({
    name: manifest.project.name,
    client: manifest.project.client,
    location: manifest.project.location,
    method: (manifest.project.method as any) || "censo",
    areaHa: manifest.project.areaHa || 0,
  });

  for (const bp of manifest.plots || []) {
    const plotId = await createPlot({
      projectId,
      code: bp.code,
      areaM2: bp.areaM2 || 0,
      shape: bp.shape || "",
      coordinates: bp.coordinates || "",
      notes: bp.notes || "",
    });

    for (const bt of bp.trees || []) {
      const photoUris: string[] = [];
      for (const p of bt.photos || []) {
        const dest = await readPhoto(p.ref);
        if (dest) photoUris.push(dest);
      }

      const treeId = await createTree({
        plotId,
        number: bt.number,
        speciesId: null,
        speciesName: bt.speciesName || "N/I",
        isTree: bt.isTree !== false,
        capCm: bt.capCm || 0,
        heightComercialM: bt.heightComercialM || 0,
        heightTotalM: bt.heightTotalM || 0,
        dbhCm: bt.dbhCm || 0,
        basalAreaM2: bt.basalAreaM2 || 0,
        stemCount: bt.stemCount || 1,
        phytosanitary: bt.phytosanitary || "",
        photoUri: photoUris[0] || "",
        notes: bt.notes || "",
        latitude: bt.latitude || 0,
        longitude: bt.longitude || 0,
        stems: (bt.fustes || []).map((f) => ({
          number: f.number,
          capCm: f.capCm || 0,
          heightComercialM: f.heightComercialM || 0,
          heightTotalM: f.heightTotalM || 0,
          dbhCm: f.dbhCm || 0,
          basalAreaM2: f.basalAreaM2 || 0,
        })),
      });

      for (let i = 0; i < photoUris.length; i++) {
        const caption = (bt.photos || [])[i]?.caption || "";
        await addTreePhoto(treeId, photoUris[i], caption);
      }
    }
  }

  return projectId;
}

// ── Importação de dados de campo via Excel (.xlsx) ──

const normalize = (s: any): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .toLowerCase()
    .trim();

const num = (v: any): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
};

// Localiza a coluna do número da árvore: "Nº", "Nº Árvore", "Número" etc.
function findNumberCol(cols: Record<string, number>): number {
  const exact = colOf(cols, "n", "nº", "n°", "numero", "numero da arvore");
  if (exact >= 0) return exact;
  const found = Object.keys(cols).find(
    (k) => k.includes("arvore") || k.includes("arbore") || /^n\b/.test(k)
  );
  return found !== undefined ? cols[found] : -1;
}

const colOf = (cols: Record<string, number>, ...names: string[]): number => {
  for (const n of names) if (cols[normalize(n)] !== undefined) return cols[normalize(n)];
  return -1;
};

function findHeaderRow(rows: any[][]): { index: number; cols: Record<string, number> } {
  const wantCols = ["parcela", "n", "nº", "numero", "numero da arvore"];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const norm = row.map((c) => normalize(c));
    const hasParcela = norm.some((c) => c === "parcela");
    const hasTreeNum = norm.some(
      (c) => wantCols.includes(c) || c.includes("arvore") || c.includes("numero")
    );
    if (hasParcela && hasTreeNum) {
      const cols: Record<string, number> = {};
      norm.forEach((c, idx) => {
        if (c) cols[c] = idx;
      });
      return { index: i, cols };
    }
  }
  throw new Error(
    "Não encontrei as colunas 'Parcela' e 'Nº Árvore' na planilha. Use o modelo de exportação do app."
  );
}

async function buildSpeciesIndex(): Promise<{
  byScientific: Map<string, Species>;
  byPopular: Map<string, Species>;
}> {
  const species = await listSpecies();
  const byScientific = new Map<string, Species>();
  const byPopular = new Map<string, Species>();
  species.forEach((s) => {
    if (s.scientificName) byScientific.set(normalize(s.scientificName), s);
    if (s.popularName) byPopular.set(normalize(s.popularName), s);
  });
  return { byScientific, byPopular };
}

function resolveSpecies(
  name: string,
  idx: { byScientific: Map<string, Species>; byPopular: Map<string, Species> }
): { speciesId: number | null; speciesName: string; isTree: boolean } {
  const key = normalize(name);
  if (!key) return { speciesId: null, speciesName: name, isTree: true };
  const sp = idx.byScientific.get(key) || idx.byPopular.get(key);
  if (sp) {
    const arborea = !sp.habit || sp.habit === "" || /^A\b|Arbórea/.test(sp.habit);
    return {
      speciesId: sp.id,
      speciesName: sp.scientificName,
      isTree: arborea,
    };
  }
  return { speciesId: null, speciesName: name.trim(), isTree: true };
}

// Importa os dados da planilha de campo (modelo "Árvores" do app) criando um
// novo projeto com parcelas e árvores. Retorna o id do projeto criado.
export async function importExcelData(uri: string, baseName: string): Promise<string> {
  const XLSX = await import("xlsx");
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const wb = XLSX.read(b64, { type: "base64" });

  const sheetName =
    wb.SheetNames.find((n) => normalize(n) === "arvores") || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("A planilha não tem nenhuma aba com dados.");

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
  });
  const { index: headerRow, cols } = findHeaderRow(rows);

  const cParcela = colOf(cols, "parcela");
  const cNumero = findNumberCol(cols);
  const cEspecie = colOf(cols, "especie", "especie (nome cientifico)", "nome cientifico", "nome");
  const cCap = colOf(cols, "cap", "cap (cm)", "cap(cm)");
  const cDap = colOf(cols, "dap", "dap (cm)", "dap(cm)");
  const cHc = colOf(cols, "altura comercial", "altura comercial (m)", "hc", "hc (m)");
  const cHt = colOf(cols, "altura total", "altura total (m)", "ht", "ht (m)");
  const cBa = colOf(cols, "area basal", "area basal (m2)", "gi");
  const cFustes = colOf(cols, "fustes");
  const cCondicao = colOf(cols, "condicao");
  const cLat = colOf(cols, "latitude");
  const cLon = colOf(cols, "longitude");
  const cObs = colOf(cols, "observacoes", "obs");

  if (cParcela < 0 || cEspecie < 0) {
    throw new Error(
      "A planilha precisa das colunas 'Parcela' e 'Espécie'. Use o modelo do app."
    );
  }

  const speciesIndex = await buildSpeciesIndex();
  const PI = Math.PI;

  const projectId = await createProject({
    name: baseName || "Importado de planilha",
    client: "",
    location: "",
    method: "censo",
    areaHa: 0,
  });

  const plotsByCode = new Map<string, string>();
  let treeCount = 0;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const parcela = normalize(row[cParcela]);
    const numeroRaw = row[cNumero];
    const especie = String(row[cEspecie] ?? "").trim();

    if (!parcela && !especie && (numeroRaw === "" || numeroRaw === undefined)) continue;
    if (!especie) continue;

    let plotId = plotsByCode.get(parcela);
    if (plotId === undefined) {
      plotId = await createPlot({
        projectId,
        code: parcela || `P${plotsByCode.size + 1}`,
        areaM2: 0,
        shape: "",
        coordinates: "",
        notes: "",
      });
      plotsByCode.set(parcela, plotId);
    }

    const cap = num(row[cCap]);
    let dap = num(row[cDap]);
    let ba = num(row[cBa]);
    if (dap === 0 && cap > 0) dap = cap / PI;
    if (ba === 0 && dap > 0) ba = dap * dap * 0.000078539816;

    const resolved = resolveSpecies(especie, speciesIndex);

    treeCount++;
    await createTree({
      plotId,
      number: num(numeroRaw) || treeCount,
      speciesId: resolved.speciesId,
      speciesName: resolved.speciesName,
      isTree: resolved.isTree,
      capCm: cap,
      heightComercialM: num(row[cHc]),
      heightTotalM: num(row[cHt]),
      dbhCm: dap,
      basalAreaM2: ba,
      stemCount: Math.max(1, Math.round(num(row[cFustes])) || 1),
      phytosanitary: String(row[cCondicao] ?? "").trim(),
      photoUri: "",
      notes: String(row[cObs] ?? "").trim(),
      latitude: num(row[cLat]),
      longitude: num(row[cLon]),
    });
  }

  return projectId;
}
