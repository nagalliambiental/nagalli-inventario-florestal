export type RootStackParamList = {
  Home: undefined;
  ProjectForm: { projectId?: string };
  Project: { projectId: string };
  PlotForm: { projectId: string; plotId?: string };
  Plot: { plotId: string };
  TreeForm: { plotId: string; treeId?: string };
  Report: { projectId: string };
  Users: undefined;
};
