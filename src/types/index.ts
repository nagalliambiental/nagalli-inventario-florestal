export interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  method: SurveyMethod;
  areaHa: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type SurveyMethod =
  | "censo"
  | "parcelas_fixas"
  | "pcqm"
  | "arvores_isoladas";

export interface Plot {
  id: string;
  projectId: string;
  code: string;
  areaM2: number;
  shape: string;
  coordinates: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Tree {
  id: string;
  plotId: string;
  number: number;
  speciesId: number | null;
  speciesName: string;
  isTree: boolean;
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
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  fustes: Stem[];
  photos: TreePhoto[];
}

export interface TreePhoto {
  id: string;
  treeId: string;
  uri: string;
  caption: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Stem {
  id: string;
  treeId: string;
  number: number;
  capCm: number;
  heightComercialM: number;
  heightTotalM: number;
  dbhCm: number;
  basalAreaM2: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
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
