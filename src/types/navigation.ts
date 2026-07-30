export type RootStackParamList = {
  Home: undefined;
  ProjectForm: { projectId?: number };
  Project: { projectId: number };
  PlotForm: { projectId: number; plotId?: number };
  Plot: { plotId: number };
  TreeForm: { plotId: number; treeId?: number };
  Report: { projectId: number };
};
