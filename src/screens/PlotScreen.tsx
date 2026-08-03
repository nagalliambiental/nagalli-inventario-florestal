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
import { listTrees, deleteTree, listStems } from "../db/database";
import { colors } from "../constants/colors";
import { fmtCm, fmtM, fmtM2, fmtM3, fmtDate } from "../utils/formats";
import { calcPlotResults, calcShannon, calcPielou, sumTreeVolumes, treeDbhCm } from "../utils/calculations";
import type { Tree } from "../types";
import type { RootStackParamList } from "../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Plot">;

export function PlotScreen({ route, navigation }: Props) {
  const { plotId } = route.params;
  const [trees, setTrees] = useState<Tree[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadTrees();
    }, [plotId])
  );

  const loadTrees = async () => {
    const t = await listTrees(plotId);
    setTrees(t);
  };

  const treeTrees = trees.filter((t) => t.isTree);
  const results = calcPlotResults(treeTrees);
  const shannon = calcShannon(treeTrees);
  const pielou = calcPielou(treeTrees, shannon);
  const vols = sumTreeVolumes(treeTrees);

  const handleDelete = (id: string, num: number) => {
    Alert.alert("Excluir", `Excluir árvore #${num}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => deleteTree(id).then(loadTrees) },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.results}>
        <View style={styles.row}>
          <MiniStat label="Árvores" value={String(treeTrees.length)} />
          <MiniStat label="Espécies" value={String(results.speciesCount)} />
          <MiniStat label="Área basal" value={fmtM2(results.basalAreaTotal)} />
          <MiniStat label="Vol. comercial" value={`${results.volumeTotal.toFixed(1)} m³`} />
        </View>
        <View style={styles.row}>
          <MiniStat label="DAP médio" value={fmtCm(results.avgDbh)} />
          <MiniStat label="Altura média" value={fmtM(results.avgHeight)} />
          <MiniStat label="Shannon (H')" value={shannon.toFixed(3)} />
          <MiniStat label="Pielou (J')" value={pielou.toFixed(3)} />
        </View>
        <View style={styles.row}>
          <MiniStat label="Vol. tora" value={fmtM3(vols.volumeTora)} />
          <MiniStat label="Vol. total" value={fmtM3(vols.volumeTotal)} />
          <MiniStat label="Vol. lenha" value={fmtM3(vols.volumeLenha)} />
        </View>
      </View>

      <FlatList
        data={trees}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Nenhuma árvore cadastrada</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate("TreeForm", { plotId, treeId: item.id })}
            onLongPress={() => handleDelete(item.id, item.number)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.treeNum}>#{item.number}</Text>
              {item.isTree === false && (
                <Text style={styles.nonTreeTag}>não-árvore</Text>
              )}
              <Text style={styles.species}>{item.speciesName || "—"}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.meta}>CAP: {fmtCm(item.capCm)}</Text>
              <Text style={styles.meta}>DAP: {fmtCm(treeDbhCm(item))}</Text>
              <Text style={styles.meta}>Alt. total: {fmtM(item.heightTotalM)}</Text>
              <Text style={styles.meta}>Fustes: {item.stemCount}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("TreeForm", { plotId })}
      >
        <Text style={styles.fabText}>+ Árvore</Text>
      </TouchableOpacity>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  results: { padding: 12, paddingBottom: 0 },
  row: { flexDirection: "row", gap: 6, marginBottom: 6 },
  miniStat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
  },
  miniValue: { fontSize: 15, fontWeight: "700", color: colors.primary },
  miniLabel: { fontSize: 9, color: colors.textSecondary, marginTop: 1 },
  list: { padding: 16, paddingBottom: 80 },
  empty: { textAlign: "center", color: colors.textLight, marginTop: 40, fontSize: 15 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  nonTreeTag: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    backgroundColor: colors.secondary,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  treeNum: { fontSize: 16, fontWeight: "700", color: colors.text },
  species: { fontSize: 15, color: colors.textSecondary, fontStyle: "italic" },
  cardRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  meta: { fontSize: 13, color: colors.textLight },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    elevation: 4,
  },
  fabText: { color: colors.white, fontWeight: "700", fontSize: 15 },
});
