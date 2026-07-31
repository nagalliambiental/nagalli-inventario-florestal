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
  heightComercialM: number;
  heightTotalM: number;
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
  photos: TreePhoto[];
}

export interface TreePhoto {
  id: number;
  treeId: number;
  uri: string;
  caption: string;
  createdAt: string;
}

export interface Stem {
  id: number;
  treeId: number;
  number: number;
  capCm: number;
  heightComercialM: number;
  heightTotalM: number;
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
  habit: string;
  distribution: string;
  endemism: string;
  conservationStatus: string;
  growth: string;
  lifeSpan: string;
  dbhAmplitude: string;
  heightAmplitude: string;
  epiphytes: string;
  herbaceousLianas: string;
  woodyLianas: string;
  grasses: string;
  canopyRegeneration: string;
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
