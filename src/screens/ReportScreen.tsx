import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
  Alert,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { getProject, listPlots, listTrees, getProjectSummary } from "../db/database";
import { colors } from "../constants/colors";
import {
  calcPlotResults,
  calcShannon,
  calcPielou,
  calcIVI,
} from "../utils/calculations";
import { fmtCm, fmtM, fmtM2, fmtM3, fmtPct } from "../utils/formats";
import type { Tree, Project } from "../types";
import type { RootStackParamList } from "../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Report">;

export function ReportScreen({ route }: Props) {
  const { projectId } = route.params;
  const [project, setProject] = useState<Project | null>(null);
  const [trees, setTrees] = useState<Tree[]>([]);

  useFocusEffect(
    useCallback(() => {
      getProject(projectId).then(setProject);
      loadAllTrees();
    }, [projectId])
  );

  const loadAllTrees = async () => {
    const plots = await listPlots(projectId);
    const allTrees: Tree[] = [];
    for (const p of plots) {
      const ts = await listTrees(p.id);
      allTrees.push(...ts);
    }
    setTrees(allTrees);
  };

  if (!project) return null;

  const results = calcPlotResults(trees);
  const shannon = calcShannon(trees);
  const pielou = calcPielou(trees, shannon);
  const ivi = calcIVI(trees);

  const handleShare = async () => {
    const lines = [
      `Projeto: ${project.name}`,
      `Cliente: ${project.client || "—"}`,
      `Local: ${project.location || "—"}`,
      `Método: ${project.method}`,
      `Área: ${project.areaHa} ha`,
      "",
      `Total de árvores: ${trees.length}`,
      `Total de espécies: ${results.speciesCount}`,
      `Área basal total: ${fmtM2(results.basalAreaTotal)}`,
      `Volume total: ${fmtM3(results.volumeTotal)}`,
      `DAP médio: ${fmtCm(results.avgDbh)}`,
      `Altura média: ${fmtM(results.avgHeight)}`,
      `Shannon (H'): ${shannon.toFixed(3)}`,
      `Pielou (J'): ${pielou.toFixed(3)}`,
      "",
      "IVI - Índice de Valor de Importância:",
      ...ivi.map(
        (s, i) =>
          `${i + 1}. ${s.speciesName}: IVI=${s.ivi.toFixed(2)} (Dens=${fmtPct(s.density)}, Dom=${fmtPct(s.dominance)}, Freq=${fmtPct(s.frequency)})`
      ),
    ];
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {}
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.projectName}>{project.name}</Text>
        <Text style={styles.projectMeta}>
          {project.client} • {project.areaHa} ha
        </Text>
      </View>

      {/* General stats */}
      <Section title="Estatísticas gerais">
        <StatRow label="Total de árvores" value={String(trees.length)} />
        <StatRow label="Total de espécies" value={String(results.speciesCount)} />
        <StatRow label="DAP médio" value={fmtCm(results.avgDbh)} />
        <StatRow label="Altura média" value={fmtM(results.avgHeight)} />
        <StatRow label="Área basal total" value={fmtM2(results.basalAreaTotal)} />
        <StatRow label="Volume total" value={fmtM3(results.volumeTotal)} />
      </Section>

      {/* Diversity */}
      <Section title="Diversidade">
        <StatRow label="Shannon-Wiener (H')" value={shannon.toFixed(3)} />
        <StatRow label="Pielou (J')" value={pielou.toFixed(3)} />
      </Section>

      {/* IVI */}
      <Section title="IVI — Índice de Valor de Importância">
        {ivi.map((s, i) => (
          <View key={s.speciesName} style={styles.iviRow}>
            <Text style={styles.iviPos}>{i + 1}.</Text>
            <View style={styles.iviInfo}>
              <Text style={styles.iviSpecies}>{s.speciesName}</Text>
              <Text style={styles.iviMeta}>
                N={s.n} • Dens={fmtPct(s.density)} • Dom={fmtPct(s.dominance)} • Freq={fmtPct(s.frequency)}
              </Text>
            </View>
            <Text style={styles.iviValue}>{s.ivi.toFixed(1)}</Text>
          </View>
        ))}
      </Section>

      <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
        <Text style={styles.shareText}>Compartilhar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 20 },
  projectName: { fontSize: 22, fontWeight: "700", color: colors.text },
  projectMeta: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 10,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + "40",
  },
  statLabel: { fontSize: 14, color: colors.textSecondary },
  statValue: { fontSize: 14, fontWeight: "600", color: colors.text },
  iviRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + "40",
  },
  iviPos: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textLight,
    width: 24,
  },
  iviInfo: { flex: 1 },
  iviSpecies: { fontSize: 14, fontWeight: "600", color: colors.text, fontStyle: "italic" },
  iviMeta: { fontSize: 11, color: colors.textLight, marginTop: 2 },
  iviValue: { fontSize: 16, fontWeight: "700", color: colors.primary },
  shareBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  shareText: { color: colors.white, fontSize: 16, fontWeight: "700" },
});
