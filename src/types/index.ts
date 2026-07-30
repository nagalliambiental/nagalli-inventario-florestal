export interface Project {
  id: number;
  name: string;
  client: string;
  location: string;
  method: SurveyMethod;
  areaHa: number;
  createdAt: string;
  updatedAt: string;
}

export type SurveyMethod =
  | "censo"
  | "parcelas_fixas"
  | "pcqm"
  | "arvores_isoladas";

export interface Plot {
  id: number;
  projectId: number;
  code: string;
  areaM2: number;
  shape: string;
  coordinates: string;
  notes: string;
  createdAt: string;
}

export interface Tree {
  id: number;
  plotId: number;
  number: number;
  speciesId: number | null;
  speciesName: string;
  capCm: number;
  heightM: number;
  dbhCm: number;
  basalAreaM2: number;
  stemCount: number;
  phytosanitary: string;
  photoUri: string;
  notes: string;
  latitude: number;
  longitude: number;
  measuredAt: string;
  fustes: Stem[];
}

export interface Stem {
  id: number;
  treeId: number;
  number: number;
  capCm: number;
  dbhCm: number;
  basalAreaM2: number;
}

export interface Species {
  id: number;
  popularName: string;
  scientificName: string;
  family: string;
  phytophysiognomy: string;
  woodDensity: number;
}

export interface ProjectSummary {
  project: Project;
  plotCount: number;
  treeCount: number;
  speciesCount: number;
  basalAreaTotal: number;
  volumeTotal: number;
}

export interface PlotResults {
  density: number;
  dominance: number;
  frequency: number;
  ivi: number;
  shannon: number;
  pielou: number;
}
