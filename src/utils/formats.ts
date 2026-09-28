export function fmtCm(value: number): string {
  return `${value.toFixed(1)} cm`;
}

export function fmtM(value: number): string {
  return `${value.toFixed(1)} m`;
}

export function fmtM2(value: number): string {
  return `${value.toFixed(4)} m²`;
}

export function fmtM3(value: number): string {
  return `${value.toFixed(2)} m³`;
}

export function fmtPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

// America/São_Paulo = UTC-3 fixo (Brasil sem horário de verão desde 2019).
// O deslocamento é aplicado ao epoch e os getters UTC renderizam a hora local
// de São Paulo independentemente do fuso horário do aparelho.
// (UTC-3 ⇒ deslocamento negativo em relação à UTC.)
const SP_OFFSET_MS = -(3 * 60 * 60 * 1000);

function spDate(d: Date): Date {
  return new Date(d.getTime() + SP_OFFSET_MS);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function fmtDate(dateStr: string | number): string {
  if (dateStr === null || dateStr === undefined || dateStr === "") return "";
  const d = typeof dateStr === "number" ? new Date(dateStr) : new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const s = spDate(d);
  return `${pad(s.getUTCDate())}/${pad(s.getUTCMonth() + 1)}/${s.getUTCFullYear()}`;
}

export function fmtDateTime(dateStr: string | number): string {
  if (dateStr === null || dateStr === undefined || dateStr === "") return "";
  const d = typeof dateStr === "number" ? new Date(dateStr) : new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const s = spDate(d);
  return `${fmtDate(d.getTime())} ${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}:${pad(s.getUTCSeconds())}`;
}

export function methodLabel(method: string): string {
  const labels: Record<string, string> = {
    censo: "Censo Florestal",
    parcelas_fixas: "Parcelas Fixas",
    pcqm: "Ponto-Quadrante (PCQM)",
    arvores_isoladas: "Árvores Isoladas",
  };
  return labels[method] || method;
}

export const phytoOptions = [
  "Amazônia",
  "Mata Atlântica",
  "Cerrado",
  "Caatinga",
  "Pantanal",
  "Pampa",
];

export const methodOptions = [
  { value: "censo", label: "Censo Florestal" },
  { value: "parcelas_fixas", label: "Parcelas Fixas" },
  { value: "pcqm", label: "Ponto-Quadrante (PCQM)" },
  { value: "arvores_isoladas", label: "Árvores Isoladas" },
];

export const phytosanitaryOptions = [
  "Saudável",
  "Danificada",
  "Doente",
  "Morta",
  "Suprimida",
];
