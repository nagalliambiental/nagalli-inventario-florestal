import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { Project, Plot, Tree } from "../types";
import { treeDbhCm } from "./calculations";

export async function exportXlsx(
  project: Project,
  plots: Plot[],
  trees: Tree[]
) {
  const XLSX = await import("xlsx");

  const treeRows = trees.map((t) => {
    const plot = plots.find((p) => p.id === t.plotId);
    const cap = t.capCm || t.fustes.reduce((s, f) => s + f.capCm, 0);
    return {
      Parcela: plot?.code || "",
      "Nº Árvore": t.number,
      Espécie: t.speciesName,
      "CAP (cm)": cap,
      "DAP (cm)": treeDbhCm(t),
      "Altura comercial (m)": t.heightComercialM,
      "Altura total (m)": t.heightTotalM,
      "Área basal (m²)": t.basalAreaM2,
      Fustes: t.stemCount,
      "Condição": t.phytosanitary,
      Latitude: t.latitude,
      Longitude: t.longitude,
      Observações: t.notes,
    };
  });

  const stemRows: any[] = [];
  trees.forEach((t) => {
    const plot = plots.find((p) => p.id === t.plotId);
    (t.fustes || []).forEach((f, i) => {
      stemRows.push({
        Parcela: plot?.code || "",
        "Nº Árvore": t.number,
        Fuste: i + 1,
        "CAP (cm)": f.capCm,
        "DAP (cm)": f.dbhCm || 0,
        "Altura comercial (m)": f.heightComercialM,
        "Altura total (m)": f.heightTotalM,
        "Área basal (m²)": f.basalAreaM2,
      });
    });
  });

  const ws = XLSX.utils.json_to_sheet(treeRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Árvores");

  if (stemRows.length > 0) {
    const wsStems = XLSX.utils.json_to_sheet(stemRows);
    XLSX.utils.book_append_sheet(wb, wsStems, "Fustes");
  }

  // Summary sheet
  const summary = [
    { Indicador: "Projeto", Valor: project.name },
    { Indicador: "Cliente", Valor: project.client || "" },
    { Indicador: "Localização", Valor: project.location || "" },
    { Indicador: "Método", Valor: project.method },
    { Indicador: "Área (ha)", Valor: project.areaHa },
    { Indicador: "Total Parcelas", Valor: plots.length },
    { Indicador: "Total Árvores", Valor: trees.length },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

  const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  const uri = FileSystem.documentDirectory + `${project.name.replace(/[\\/:*?"<>|]/g, "_")}.xlsx`;
  await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function exportKml(
  project: Project,
  plots: Plot[],
  trees: Tree[]
) {
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${project.name}</name>
    ${trees
      .filter((t) => t.latitude !== 0 && t.longitude !== 0)
      .map(
        (t) => `
    <Placemark>
      <name>#${t.number} - ${t.speciesName || "N/I"}</name>
      <description>CAP: ${t.capCm} cm, Alt total: ${t.heightTotalM} m, DAP: ${treeDbhCm(t)} cm</description>
      <Point><coordinates>${t.longitude},${t.latitude},0</coordinates></Point>
    </Placemark>`
      )
      .join("")}
  </Document>
</kml>`;

  const uri = FileSystem.documentDirectory + `${project.name.replace(/[\\/:*?"<>|]/g, "_")}.kml`;
  await FileSystem.writeAsStringAsync(uri, kml);
  await Sharing.shareAsync(uri, { mimeType: "application/vnd.google-earth.kml+xml" });
}
