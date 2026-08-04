import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { getProject, listPlots, deletePlot, getProjectSummary, listTrees } from "../db/database";
import { colors } from "../constants/colors";
import { fmtDate, methodLabel, fmtM2, fmtM3 } from "../utils/formats";
import { sumTreeVolumes } from "../utils/calculations";
import { useUser } from "../contexts/UserContext";
import type { Plot, ProjectSummary, Tree } from "../types";
import type { RootStackParamList } from "../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Project">;

export function ProjectScreen({ route, navigation }: Props) {
  const { isAdmin } = useUser();
  const { projectId } = route.params;
  const [project, setProject] = useState<any>(null);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [trees, setTrees] = useState<Tree[]>([]);

  useFocusEffect(
    useCallback(() => {
      getProject(projectId).then(setProject);
      listPlots(projectId).then(setPlots);
      getProjectSummary(projectId).then(setSummary);
      (async () => {
        const p = await listPlots(projectId);
        const all: Tree[] = [];
        for (const plot of p) {
          all.push(...(await listTrees(plot.id)));
        }
        setTrees(all);
      })();
    }, [projectId])
  );

  const handleDeletePlot = (id: string, code: string) => {
    if (!isAdmin) {
      Alert.alert(
        "Acesso restrito",
        "Somente o administrador pode excluir parcelas."
      );
      return;
    }
    Alert.alert("Excluir parcela", `Excluir "${code}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => deletePlot(id).then(() => listPlots(projectId).then(setPlots)) },
    ]);
  };

  if (!project) return null;

  const vols = sumTreeVolumes(trees.filter((t) => t.isTree));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={styles.projectName} numberOfLines={1}>
            {project.name}
          </Text>
          {project.createdBy ? (
            <Text style={styles.createdBy}>Criado por {project.createdBy}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate("ProjectForm", { projectId })}
          style={styles.editBtn}
        >
          <Text style={styles.editText}>✏️ Editar</Text>
        </TouchableOpacity>
      </View>
      {summary && (
        <View style={styles.summary}>
          <View style={styles.statRow}>
            <StatBox label="Parcelas" value={String(summary.plotCount)} />
            <StatBox label="Árvores" value={String(summary.treeCount)} />
            <StatBox label="Espécies" value={String(summary.speciesCount)} />
          </View>
          <View style={styles.statRow}>
            <StatBox label="Área basal" value={fmtM2(summary.basalAreaTotal)} small />
            <StatBox label="Vol. total" value={fmtM3(vols.volumeTotal)} small />
          </View>
          <View style={styles.statRow}>
            <StatBox label="Vol. tora" value={fmtM3(vols.volumeTora)} small />
            <StatBox label="Vol. lenha" value={fmtM3(vols.volumeLenha)} small />
          </View>
        </View>
      )}

      <FlatList
        data={plots}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Nenhuma parcela cadastrada</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate("Plot", { plotId: item.id })}
            onLongPress={() => handleDeletePlot(item.id, item.code)}
          >
            <Text style={styles.cardTitle}>{item.code}</Text>
            {item.areaM2 > 0 && <Text style={styles.meta}>{item.areaM2} m²</Text>}
            <Text style={styles.date}>{fmtDate(item.createdAt)}</Text>
          </TouchableOpacity>
        )}
      />

      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => navigation.navigate("Report", { projectId })}
        >
          <Text style={styles.reportText}>Relatórios</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate("PlotForm", { projectId })}
        >
          <Text style={styles.fabText}>+ Parcela</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StatBox({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <View style={[styles.statBox, small && { flex: 1 }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  projectName: { fontSize: 19, fontWeight: "700", color: colors.text },
  createdBy: { fontSize: 12, color: colors.textLight, marginTop: 2 },
  editBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editText: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  summary: { padding: 16, paddingBottom: 0 },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    elevation: 1,
  },
  statValue: { fontSize: 20, fontWeight: "700", color: colors.primary },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  list: { padding: 16, paddingBottom: 80 },
  empty: { textAlign: "center", color: colors.textLight, marginTop: 40, fontSize: 15 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.secondary,
    elevation: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  date: { fontSize: 11, color: colors.textLight, marginTop: 4 },
  bottomRow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  reportBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  reportText: { color: colors.primary, fontWeight: "600", fontSize: 15 },
  fab: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  fabText: { color: colors.white, fontWeight: "700", fontSize: 15 },
});
