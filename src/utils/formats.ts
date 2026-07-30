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

export function fmtDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR");
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
