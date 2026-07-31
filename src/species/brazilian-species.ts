import type { Species } from "../types";

type BaseSpecies = Omit<
  Species,
  | "id"
  | "habit"
  | "distribution"
  | "endemism"
  | "conservationStatus"
  | "growth"
  | "lifeSpan"
  | "dbhAmplitude"
  | "heightAmplitude"
  | "epiphytes"
  | "herbaceousLianas"
  | "woodyLianas"
  | "grasses"
  | "canopyRegeneration"
>;

const rawSpecies: BaseSpecies[] = [
  // ── Amazônia ──
  { popularName: "Ipê-roxo", scientificName: "Handroanthus impetiginosus", family: "Bignoniaceae", phytophysiognomy: "Amazônia", woodDensity: 0.85 },
  { popularName: "Mogno", scientificName: "Swietenia macrophylla", family: "Meliaceae", phytophysiognomy: "Amazônia", woodDensity: 0.62 },
  { popularName: "Cedro-rosa", scientificName: "Cedrela fissilis", family: "Meliaceae", phytophysiognomy: "Amazônia", woodDensity: 0.58 },
  { popularName: "Castanheira", scientificName: "Bertholletia excelsa", family: "Lecythidaceae", phytophysiognomy: "Amazônia", woodDensity: 0.67 },
  { popularName: "Samaúma", scientificName: "Ceiba pentandra", family: "Malvaceae", phytophysiognomy: "Amazônia", woodDensity: 0.35 },
  { popularName: "Cumaru", scientificName: "Dipteryx odorata", family: "Fabaceae", phytophysiognomy: "Amazônia", woodDensity: 0.93 },
  { popularName: "Jatobá", scientificName: "Hymenaea courbaril", family: "Fabaceae", phytophysiognomy: "Amazônia", woodDensity: 0.86 },
  { popularName: "Andiroba", scientificName: "Carapa guianensis", family: "Meliaceae", phytophysiognomy: "Amazônia", woodDensity: 0.68 },
  { popularName: "Açacu", scientificName: "Hura crepitans", family: "Euphorbiaceae", phytophysiognomy: "Amazônia", woodDensity: 0.41 },
  { popularName: "Tauari", scientificName: "Couratari oblongifolia", family: "Lecythidaceae", phytophysiognomy: "Amazônia", woodDensity: 0.58 },
  { popularName: "Angelim-vermelho", scientificName: "Dinizia excelsa", family: "Fabaceae", phytophysiognomy: "Amazônia", woodDensity: 0.72 },
  { popularName: "Paricá", scientificName: "Schizolobium parahyba", family: "Fabaceae", phytophysiognomy: "Amazônia", woodDensity: 0.39 },
  { popularName: "Bacuri", scientificName: "Platonia insignis", family: "Clusiaceae", phytophysiognomy: "Amazônia", woodDensity: 0.75 },
  { popularName: "Pau-amarelo", scientificName: "Euxylophora paraensis", family: "Rutaceae", phytophysiognomy: "Amazônia", woodDensity: 0.78 },
  { popularName: "Breu-vermelho", scientificName: "Protium heptaphyllum", family: "Burseraceae", phytophysiognomy: "Amazônia", woodDensity: 0.55 },

  // ── Mata Atlântica ──
  { popularName: "Ipê-amarelo", scientificName: "Handroanthus albus", family: "Bignoniaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.82 },
  { popularName: "Pau-brasil", scientificName: "Paubrasilia echinata", family: "Fabaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.92 },
  { popularName: "Jequitibá-rosa", scientificName: "Cariniana legalis", family: "Lecythidaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.58 },
  { popularName: "Peroba-rosa", scientificName: "Aspidosperma polyneuron", family: "Apocynaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.75 },
  { popularName: "Jacarandá-da-bahia", scientificName: "Dalbergia nigra", family: "Fabaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.87 },
  { popularName: "Araucária", scientificName: "Araucaria angustifolia", family: "Araucariaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.52 },
  { popularName: "Pau-d'alho", scientificName: "Gallesia integrifolia", family: "Phytolaccaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.55 },
  { popularName: "Palmito-juçara", scientificName: "Euterpe edulis", family: "Arecaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.35 },
  { popularName: "Guapuruvu", scientificName: "Schizolobium parahyba", family: "Fabaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.39 },
  { popularName: "Embaúba", scientificName: "Cecropia pachystachya", family: "Urticaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.38 },
  { popularName: "Ingá-feijão", scientificName: "Inga marginata", family: "Fabaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.62 },
  { popularName: "Canjerana", scientificName: "Cabralea canjerana", family: "Meliaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.65 },
  { popularName: "Cedro", scientificName: "Cedrela fissilis", family: "Meliaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.58 },
  { popularName: "Bicuíba", scientificName: "Virola bicuhyba", family: "Myristicaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.49 },
  { popularName: "Pindaíba", scientificName: "Xylopia brasiliensis", family: "Annonaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.60 },
  { popularName: "Goiaba", scientificName: "Psidium guajava", family: "Myrtaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.67 },
  { popularName: "Capixingui", scientificName: "Croton floribundus", family: "Euphorbiaceae", phytophysiognomy: "Mata Atlântica", woodDensity: 0.47 },

  // ── Cerrado ──
  { popularName: "Pequi", scientificName: "Caryocar brasiliense", family: "Caryocaraceae", phytophysiognomy: "Cerrado", woodDensity: 0.78 },
  { popularName: "Baru", scientificName: "Dipteryx alata", family: "Fabaceae", phytophysiognomy: "Cerrado", woodDensity: 0.88 },
  { popularName: "Angico", scientificName: "Anadenanthera peregrina", family: "Fabaceae", phytophysiognomy: "Cerrado", woodDensity: 0.73 },
  { popularName: "Cagaita", scientificName: "Eugenia dysenterica", family: "Myrtaceae", phytophysiognomy: "Cerrado", woodDensity: 0.72 },
  { popularName: "Ipê-do-cerrado", scientificName: "Handroanthus ochraceus", family: "Bignoniaceae", phytophysiognomy: "Cerrado", woodDensity: 0.81 },
  { popularName: "Aroeira-do-sertão", scientificName: "Myracrodruon urundeuva", family: "Anacardiaceae", phytophysiognomy: "Cerrado", woodDensity: 0.96 },
  { popularName: "Jatobá-do-cerrado", scientificName: "Hymenaea stigonocarpa", family: "Fabaceae", phytophysiognomy: "Cerrado", woodDensity: 0.84 },
  { popularName: "Pau-terra", scientificName: "Qualea grandiflora", family: "Vochysiaceae", phytophysiognomy: "Cerrado", woodDensity: 0.62 },
  { popularName: "Lixeira", scientificName: "Curatella americana", family: "Dilleniaceae", phytophysiognomy: "Cerrado", woodDensity: 0.68 },
  { popularName: "Murici", scientificName: "Byrsonima crassifolia", family: "Malpighiaceae", phytophysiognomy: "Cerrado", woodDensity: 0.75 },

  // ── Caatinga ──
  { popularName: "Aroeira-do-sertão", scientificName: "Myracrodruon urundeuva", family: "Anacardiaceae", phytophysiognomy: "Caatinga", woodDensity: 0.96 },
  { popularName: "Angico-de-caroço", scientificName: "Anadenanthera colubrina", family: "Fabaceae", phytophysiognomy: "Caatinga", woodDensity: 0.78 },
  { popularName: "Juazeiro", scientificName: "Ziziphus joazeiro", family: "Rhamnaceae", phytophysiognomy: "Caatinga", woodDensity: 0.72 },
  { popularName: "Catingueira", scientificName: "Poincianella pyramidalis", family: "Fabaceae", phytophysiognomy: "Caatinga", woodDensity: 0.85 },
  { popularName: "Baraúna", scientificName: "Schinopsis brasiliensis", family: "Anacardiaceae", phytophysiognomy: "Caatinga", woodDensity: 0.94 },
  { popularName: "Umbuzeiro", scientificName: "Spondias tuberosa", family: "Anacardiaceae", phytophysiognomy: "Caatinga", woodDensity: 0.48 },
  { popularName: "Mandioca-brava", scientificName: "Manihot glaziovii", family: "Euphorbiaceae", phytophysiognomy: "Caatinga", woodDensity: 0.42 },

  // ── Pantanal ──
  { popularName: "Paratudo", scientificName: "Tabebuia aurea", family: "Bignoniaceae", phytophysiognomy: "Pantanal", woodDensity: 0.76 },
  { popularName: "Caranda", scientificName: "Copernicia alba", family: "Arecaceae", phytophysiognomy: "Pantanal", woodDensity: 0.65 },
  { popularName: "Acuri", scientificName: "Attalea phalerata", family: "Arecaceae", phytophysiognomy: "Pantanal", woodDensity: 0.55 },
  { popularName: "Cambará", scientificName: "Vochysia divergens", family: "Vochysiaceae", phytophysiognomy: "Pantanal", woodDensity: 0.48 },

  // ── Pampa ──
  { popularName: "Butiá", scientificName: "Butia odorata", family: "Arecaceae", phytophysiognomy: "Pampa", woodDensity: 0.58 },
  { popularName: "Corticeira-do-banhado", scientificName: "Erythrina crista-galli", family: "Fabaceae", phytophysiognomy: "Pampa", woodDensity: 0.42 },
  { popularName: "Araçá", scientificName: "Psidium cattleianum", family: "Myrtaceae", phytophysiognomy: "Pampa", woodDensity: 0.71 },
  { popularName: "Guabiju", scientificName: "Myrcianthes pungens", family: "Myrtaceae", phytophysiognomy: "Pampa", woodDensity: 0.74 },
];

export const defaultSpecies: Omit<Species, "id">[] = rawSpecies.map((s) => ({
  habit: "",
  distribution: "",
  endemism: "",
  conservationStatus: "",
  growth: "",
  lifeSpan: "",
  dbhAmplitude: "",
  heightAmplitude: "",
  epiphytes: "",
  herbaceousLianas: "",
  woodyLianas: "",
  grasses: "",
  canopyRegeneration: "",
  ...s,
}));
