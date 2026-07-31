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
import { getProject, listPlots, listTrees, getProjectSummary, listSpecies } from "../db/database";
import { colors } from "../constants/colors";
import {
  calcPlotResults,
  calcShannon,
  calcPielou,
  calcIVI,
  calcSpeciesVolumes,
} from "../utils/calculations";
import { fmtCm, fmtM, fmtM2, fmtM3, fmtPct } from "../utils/formats";
import { useMemo } from "react";
import { calcSufficiency } from "../utils/sufficiency";
import { buildSamplingReport } from "../utils/sampling";
import { exportXlsx, exportKml } from "../utils/export";
import { useTheme } from "../contexts/ThemeContext";
import { calcDiameterDistribution } from "../utils/diametric";
import {
  calcHorizontalStructure,
  calcVerticalStructure,
} from "../utils/structure";
import { calcConama, calcFloristic } from "../utils/conama";
import type { Tree, Project, Plot, Species } from "../types";
import type { RootStackParamList } from "../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Report">;

export function ReportScreen({ route }: Props) {
  const { projectId } = route.params;
  const { colors, isDark, toggle } = useTheme();
  const [project, setProject] = useState<Project | null>(null);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);

  useFocusEffect(
    useCallback(() => {
      getProject(projectId).then(setProject);
      loadAllData();
    }, [projectId])
  );

  const loadAllData = async () => {
    const p = await listPlots(projectId);
    setPlots(p);
    const allTrees: Tree[] = [];
    for (const plot of p) {
      const ts = await listTrees(plot.id);
      allTrees.push(...ts);
    }
    setTrees(allTrees);
    setSpecies(await listSpecies());
  };

  const styles = useStyles(colors);

  if (!project) return null;

  const results = calcPlotResults(trees);
  const shannon = calcShannon(trees);
  const pielou = calcPielou(trees, shannon);
  const ivi = calcIVI(trees);
  const sufficiency = calcSufficiency(trees);
  const sampling =
    project.method === "parcelas_fixas"
      ? buildSamplingReport(project, plots, trees)
      : null;

  const speciesVolumes = calcSpeciesVolumes(trees);
  const totalVolumes = speciesVolumes.reduce(
    (acc, s) => ({
      volumeTora: acc.volumeTora + s.volumeTora,
      volumeTotal: acc.volumeTotal + s.volumeTotal,
      volumeLenha: acc.volumeLenha + s.volumeLenha,
    }),
    { volumeTora: 0, volumeTotal: 0, volumeLenha: 0 }
  );

  const areaHa = plots.reduce((s, p) => s + (p.areaM2 > 0 ? p.areaM2 : 0), 0) / 10000;
  const diametric = calcDiameterDistribution(trees, areaHa || 1);
  const horizontal = calcHorizontalStructure(plots, trees);
  const vertical = calcVerticalStructure(trees);
  const conama = calcConama(trees, species, areaHa || 1);
  const floristic = calcFloristic(trees, species);
  const threatened = floristic.filter((f) => f.threatened);

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
      <Section styles={styles} title="Estatísticas gerais">
        <StatRow styles={styles} label="Total de árvores" value={String(trees.length)} />
        <StatRow styles={styles} label="Total de espécies" value={String(results.speciesCount)} />
        <StatRow styles={styles} label="DAP médio" value={fmtCm(results.avgDbh)} />
        <StatRow styles={styles} label="Altura média" value={fmtM(results.avgHeight)} />
        <StatRow styles={styles} label="Área basal total" value={fmtM2(results.basalAreaTotal)} />
        <StatRow styles={styles} label="Volume total" value={fmtM3(results.volumeTotal)} />
      </Section>

      {/* Diversity */}
      <Section styles={styles} title="Diversidade">
        <StatRow styles={styles} label="Shannon-Wiener (H')" value={shannon.toFixed(3)} />
        <StatRow styles={styles} label="Pielou (J')" value={pielou.toFixed(3)} />
      </Section>

      {/* IVI */}
      <Section styles={styles} title="IVI — Índice de Valor de Importância">
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

      {/* Suficiência amostral */}
      <Section styles={styles} title="Suficiência amostral">
        <Text style={styles.sufficiencyText}>
          {sufficiency.sufficient
            ? "✅ Suficiência amostral atingida"
            : "⚠️ Continue amostrando — a curva de espécies ainda não estabilizou"}
        </Text>
        <StatRow styles={styles} label="Espécies registradas" value={String(sufficiency.totalSpecies)} />
        <StatRow styles={styles}
          label="Últimas amostras"
          value={`${sufficiency.sampled.length} pontos`}
        />
      </Section>

      {/* Amostragem casual simples (parcelas fixas) */}
      {sampling && sampling.volume && sampling.ba && (
        <Section styles={styles} title="Amostragem casual simples (parcelas fixas)">
          <Text style={styles.samplingHint}>
            Valores por parcela (n = {sampling.n}, área média de{" "}
            {sampling.meanPlotAreaM2.toFixed(0)} m²
            {sampling.totalPlots
              ? `, população estimada de ${sampling.totalPlots} parcelas`
              : ", população considerada infinita"}
            ), expressos por hectare.
          </Text>

          <View style={styles.samplingHeader}>
            <Text style={styles.samplingLabel}>Parâmetro</Text>
            <Text style={styles.samplingValueHeader}>Área basal</Text>
            <Text style={styles.samplingValueHeader}>Volume</Text>
          </View>

          <SamplingRow
            styles={styles}
            label="Fator de correção (F)"
            a={sampling.ba.fcp}
            b={sampling.volume.fcp}
            f={(v) => v.toFixed(4)}
          />
          <SamplingRow
            styles={styles}
            label="Média"
            a={sampling.ba.mean}
            b={sampling.volume.mean}
            f={(v) => v.toFixed(2)}
          />
          <SamplingRow
            styles={styles}
            label="Variância amostral (S²)"
            a={sampling.ba.sampleVariance}
            b={sampling.volume.sampleVariance}
            f={(v) => v.toFixed(4)}
          />
          <SamplingRow
            styles={styles}
            label="Desvio padrão (S)"
            a={sampling.ba.stdDev}
            b={sampling.volume.stdDev}
            f={(v) => v.toFixed(4)}
          />
          <SamplingRow
            styles={styles}
            label="Coeficiente de variação (CV%)"
            a={sampling.ba.cv}
            b={sampling.volume.cv}
            f={(v) => `${v.toFixed(2)}%`}
          />
          <SamplingRow
            styles={styles}
            label="Variância da média (Sx̄²)"
            a={sampling.ba.meanVariance}
            b={sampling.volume.meanVariance}
            f={(v) => v.toFixed(4)}
          />
          <SamplingRow
            styles={styles}
            label="Erro padrão da média (Sx̄)"
            a={sampling.ba.meanStdError}
            b={sampling.volume.meanStdError}
            f={(v) => v.toFixed(4)}
          />
          <SamplingRow
            styles={styles}
            label="t de Student (95%)"
            a={sampling.ba.tStudent}
            b={sampling.volume.tStudent}
            f={(v) => v.toFixed(3)}
          />
          <SamplingRow
            styles={styles}
            label="Erro de amostragem absoluto (E)"
            a={sampling.ba.absoluteError}
            b={sampling.volume.absoluteError}
            f={(v) => v.toFixed(2)}
          />
          <SamplingRow
            styles={styles}
            label="Erro de amostragem relativo (E%)"
            a={sampling.ba.relativeError}
            b={sampling.volume.relativeError}
            f={(v) => `${v.toFixed(2)}%`}
          />

          {sampling.volume.relativeError > 20 && (
            <View style={styles.samplingAlert}>
              <Text style={styles.samplingAlertText}>
                ⚠️ Erro de amostragem relativo do volume:{" "}
                {sampling.volume.relativeError.toFixed(1)}% — acima de 20%.
                Aumente o número de parcelas para reduzir o erro.
              </Text>
            </View>
          )}
          {sampling.ba.relativeError > 20 && (
            <View style={styles.samplingAlert}>
              <Text style={styles.samplingAlertText}>
                ⚠️ Erro de amostragem relativo da área basal:{" "}
                {sampling.ba.relativeError.toFixed(1)}% — acima de 20%.
              </Text>
            </View>
          )}
        </Section>
      )}

      {/* Distribuição diamétrica */}
      <Section styles={styles} title="Distribuição diamétrica">
        {diametric ? (
          <>
            <Text style={styles.samplingHint}>
              Regra de Sturges: {diametric.classCount} classes (IC ={" "}
              {diametric.classWidth.toFixed(1)} cm) • área amostrada ={" "}
              {diametric.areaHa.toFixed(3)} ha
            </Text>
            <View style={styles.volHeader}>
              <Text style={[styles.volColName, styles.volHeaderText]}>Classe DAP</Text>
              <Text style={[styles.volColNum, styles.volHeaderText]}>N</Text>
              <Text style={[styles.volColNum, styles.volHeaderText]}>Freq/ha</Text>
            </View>
            {diametric.classes.map((c, i) => (
              <View key={i} style={styles.volRow}>
                <Text style={styles.volColName}>
                  {c.lower.toFixed(1)} – {c.upper.toFixed(1)}
                </Text>
                <Text style={styles.volColNum}>{c.count}</Text>
                <Text style={styles.volColNum}>{c.freqPerHa.toFixed(1)}</Text>
              </View>
            ))}
            <View style={styles.volTotalRow}>
              <Text style={[styles.volColName, styles.volTotalText]}>Total</Text>
              <Text style={[styles.volColNum, styles.volTotalText]}>
                {diametric.n}
              </Text>
              <Text style={[styles.volColNum, styles.volTotalText]}>
                {diametric.totalFreqPerHa.toFixed(1)}
              </Text>
            </View>
            <StatRow styles={styles} label="Deq — diâmetro equivalente" value={fmtCm(diametric.deq)} />
          </>
        ) : (
          <Text style={styles.samplingHint}>Nenhuma árvore com DAP cadastrado.</Text>
        )}
      </Section>

      {/* Estrutura horizontal (por parcela) */}
      <Section styles={styles} title="Estrutura horizontal (por parcela)">
        {horizontal.length === 0 ? (
          <Text style={styles.samplingHint}>Nenhuma parcela cadastrada.</Text>
        ) : (
          <>
            <View style={styles.volHeader}>
              <Text style={[styles.volColName, styles.volHeaderText]}>Parcela</Text>
              <Text style={[styles.volColNum, styles.volHeaderText]}>N</Text>
              <Text style={[styles.volColNum, styles.volHeaderText]}>Esp.</Text>
              <Text style={[styles.volColNum, styles.volHeaderText]}>AB (m²)</Text>
            </View>
            {horizontal.map((p) => (
              <View key={p.plotId}>
                <View style={styles.volRow}>
                  <Text style={styles.volColName}>{p.plotCode}</Text>
                  <Text style={styles.volColNum}>{p.treeCount}</Text>
                  <Text style={styles.volColNum}>{p.speciesCount}</Text>
                  <Text style={styles.volColNum}>{p.basalAreaM2.toFixed(2)}</Text>
                </View>
                {p.species.length > 0 && (
                  <Text style={styles.volSub}>
                    {p.species.map((s) => `${s.name} (${s.count})`).join(", ")}
                  </Text>
                )}
              </View>
            ))}
          </>
        )}
      </Section>

      {/* Estrutura vertical (estratos) */}
      <Section styles={styles} title="Estrutura vertical (estratos)">
        {vertical.length === 0 ? (
          <Text style={styles.samplingHint}>
            Cadastre a altura total das árvores para gerar os estratos.
          </Text>
        ) : (
          <>
            <View style={styles.volHeader}>
              <Text style={[styles.volColName, styles.volHeaderText]}>Estrato</Text>
              <Text style={[styles.volColNum, styles.volHeaderText]}>Faixa (m)</Text>
              <Text style={[styles.volColNum, styles.volHeaderText]}>N</Text>
              <Text style={[styles.volColNum, styles.volHeaderText]}>Esp.</Text>
            </View>
            {vertical.map((v) => (
              <View key={v.name}>
                <View style={styles.volRow}>
                  <Text style={styles.volColName}>{v.name}</Text>
                  <Text style={styles.volColNum}>
                    {v.heightMin.toFixed(1)}–{v.heightMax.toFixed(1)}
                  </Text>
                  <Text style={styles.volColNum}>{v.treeCount}</Text>
                  <Text style={styles.volColNum}>{v.speciesCount}</Text>
                </View>
                {v.species.length > 0 && (
                  <Text style={styles.volSub}>
                    {v.species.map((s) => `${s.name} (${s.count})`).join(", ")}
                  </Text>
                )}
              </View>
            ))}
          </>
        )}
      </Section>

      {/* Análise CONAMA 05/94 */}
      <Section styles={styles} title="Análise CONAMA 05/94">
        <Text style={styles.samplingHint}>
          Estágios de regeneração classificados automaticamente pelos critérios
          do Art. 2º da resolução (DAP médio ≤ 8 cm e altura ≤ 5 m = inicial;
          8–15 cm e 5–10 m = médio; acima = avançado).
        </Text>
        {conama ? (
          <>
            <StatRow styles={styles} label="Nº de estratos" value={String(conama.strataCount)} />
            <StatRow styles={styles} label="Nº de espécies" value={String(conama.totalSpecies)} />
            <StatRow styles={styles} label="Nº de árvores" value={String(conama.totalTrees)} />
            <StatRow styles={styles} label="Área basal" value={fmtM2(conama.basalAreaM2)} />
            <StatRow styles={styles} label="Área basal por ha" value={fmtM2(conama.basalAreaM2 / (conama.areaHa || 1))} />
            <StatRow styles={styles} label="Altura média" value={fmtM(conama.avgHeightM)} />
            <StatRow styles={styles} label="DAP médio" value={fmtCm(conama.avgDapCm)} />
            <StatRow styles={styles} label="Amplitude diamétrica" value={`${fmtCm(conama.minDapCm)} – ${fmtCm(conama.maxDapCm)}`} />
            {conama.strata.map((st) => (
              <View key={st.name} style={styles.conamaStratum}>
                <Text style={styles.conamaStratumTitle}>
                  Estrato {st.name.toLowerCase()} ({st.heightMin.toFixed(1)} –{" "}
                  {st.heightMax.toFixed(1)} m)
                </Text>
                <Text style={styles.conamaStratumStage}>{st.stageLabel}</Text>
                <Text style={styles.conamaStratumMeta}>
                  N={st.treeCount} • Espécies={st.speciesCount} • AB={st.basalAreaM2.toFixed(2)} m²
                </Text>
                {st.attributes.map((a) => (
                  <View key={a.label} style={styles.statRow}>
                    <Text style={styles.statLabel}>{a.label}</Text>
                    <Text style={styles.statValue}>{a.value || "—"}</Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.samplingHint}>Cadastre árvores para gerar a análise.</Text>
        )}
      </Section>

      {/* Levantamento florístico / ameaçadas */}
      <Section styles={styles} title="Levantamento florístico e espécies ameaçadas">
        {threatened.length > 0 && (
          <View style={styles.samplingAlert}>
            <Text style={styles.samplingAlertText}>
              ⚠️ {threatened.length} espécie(s) com endemismo ou status de
              conservação — atenção à supressão.
            </Text>
          </View>
        )}
        {floristic.length === 0 ? (
          <Text style={styles.samplingHint}>Nenhuma espécie identificada.</Text>
        ) : (
          floristic.map((f) => (
            <View
              key={f.speciesName}
              style={[styles.iviRow, f.threatened && styles.threatRow]}
            >
              <View style={styles.iviInfo}>
                <Text style={[styles.iviSpecies, f.threatened && styles.threatText]}>
                  {f.speciesName}
                </Text>
                <Text style={styles.iviMeta}>
                  N={f.n}
                  {f.habit ? ` • Hab: ${f.habit}` : ""}
                  {f.distribution ? ` • Dist: ${f.distribution}` : ""}
                  {f.endemism ? ` • Endem.: ${f.endemism}` : ""}
                  {f.conservationStatus ? ` • ${f.conservationStatus}` : ""}
                </Text>
              </View>
            </View>
          ))
        )}
      </Section>

      {/* Volumes por espécie — fator de forma */}
      <Section styles={styles} title="Volumes por espécie (fator de forma)">
        <Text style={styles.samplingHint}>
          V tora = g × Hc × 0,7 • V total = g × Ht × 0,6 • V lenha = V total − V tora
        </Text>
        <View style={styles.volHeader}>
          <Text style={[styles.volColName, styles.volHeaderText]}>Espécie</Text>
          <Text style={[styles.volColNum, styles.volHeaderText]}>N</Text>
          <Text style={[styles.volColNum, styles.volHeaderText]}>Tora</Text>
          <Text style={[styles.volColNum, styles.volHeaderText]}>Total</Text>
          <Text style={[styles.volColNum, styles.volHeaderText]}>Lenha</Text>
        </View>
        {speciesVolumes.map((s) => (
          <View key={s.speciesName} style={styles.volRow}>
            <Text style={styles.volColName} numberOfLines={1}>
              {s.speciesName}
            </Text>
            <Text style={styles.volColNum}>{s.n}</Text>
            <Text style={styles.volColNum}>{fmtM3(s.volumeTora)}</Text>
            <Text style={styles.volColNum}>{fmtM3(s.volumeTotal)}</Text>
            <Text style={styles.volColNum}>{fmtM3(s.volumeLenha)}</Text>
          </View>
        ))}
        <View style={styles.volTotalRow}>
          <Text style={[styles.volColName, styles.volTotalText]}>Total</Text>
          <Text style={[styles.volColNum, styles.volTotalText]}>
            {trees.length}
          </Text>
          <Text style={[styles.volColNum, styles.volTotalText]}>
            {fmtM3(totalVolumes.volumeTora)}
          </Text>
          <Text style={[styles.volColNum, styles.volTotalText]}>
            {fmtM3(totalVolumes.volumeTotal)}
          </Text>
          <Text style={[styles.volColNum, styles.volTotalText]}>
            {fmtM3(totalVolumes.volumeLenha)}
          </Text>
        </View>
      </Section>

      {/* Export / Actions */}
      <View style={styles.actionRow}>
        {project && (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => exportXlsx(project, plots, trees)}
            >
              <Text style={styles.actionText}>📊 Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
              onPress={() => exportKml(project, plots, trees)}
            >
              <Text style={styles.actionText}>🗺️ KML</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={toggle}>
          <Text style={[styles.actionText, { color: colors.text }]}>{isDark ? "☀️ Claro" : "🌙 Escuro"}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
        <Text style={styles.shareText}>Compartilhar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Section({
  title,
  children,
  styles,
}: {
  title: string;
  children: React.ReactNode;
  styles: any;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function StatRow({ label, value, styles }: { label: string; value: string; styles: any }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function SamplingRow({
  label,
  a,
  b,
  f,
  styles,
}: {
  label: string;
  a: number;
  b: number;
  f: (v: number) => string;
  styles: any;
}) {
  return (
    <View style={styles.samplingRow}>
      <Text style={styles.samplingLabel}>{label}</Text>
      <View style={styles.samplingValues}>
        <Text style={styles.samplingValue}>{f(a)}</Text>
        <Text style={styles.samplingValue}>{f(b)}</Text>
      </View>
    </View>
  );
}

function useStyles(colors: any) {
  return useMemo(
    () =>
      StyleSheet.create({
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
        sufficiencyText: { fontSize: 14, color: colors.textSecondary, marginBottom: 8 },
        samplingHint: {
          fontSize: 12,
          color: colors.textSecondary,
          marginBottom: 10,
          fontStyle: "italic",
        },
        samplingRow: {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 6,
          borderBottomWidth: 1,
          borderBottomColor: colors.border + "40",
        },
        samplingHeader: {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 6,
          marginTop: 2,
          borderBottomWidth: 1,
          borderBottomColor: colors.border + "60",
        },
        samplingLabel: {
          flex: 1,
          flexShrink: 1,
          fontSize: 13,
          color: colors.textSecondary,
          paddingRight: 8,
        },
        samplingValueHeader: {
          width: 96,
          fontSize: 12,
          fontWeight: "700",
          color: colors.textLight,
          textAlign: "right",
        },
        samplingValues: { flexDirection: "row", gap: 8 },
        samplingValue: {
          width: 96,
          flexShrink: 0,
          fontSize: 13,
          fontWeight: "600",
          color: colors.text,
          textAlign: "right",
        },
        samplingAlert: {
          backgroundColor: colors.warning + "22",
          borderWidth: 1,
          borderColor: colors.warning,
          borderRadius: 8,
          padding: 10,
          marginTop: 10,
        },
        samplingAlertText: { fontSize: 13, color: colors.warning, fontWeight: "600" },
        volHeader: {
          flexDirection: "row",
          paddingVertical: 6,
          borderBottomWidth: 1,
          borderBottomColor: colors.border + "60",
        },
        volRow: {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 6,
          borderBottomWidth: 1,
          borderBottomColor: colors.border + "40",
        },
        volTotalRow: {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 8,
          marginTop: 2,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        volColName: { flex: 1, fontSize: 13, color: colors.text, paddingRight: 6 },
        volColNum: {
          width: 52,
          fontSize: 13,
          color: colors.text,
          textAlign: "right",
        },
        volTotalText: { fontWeight: "700", color: colors.primary },
        volHeaderText: { fontWeight: "700", color: colors.textLight },
        volSub: {
          fontSize: 11,
          color: colors.textLight,
          fontStyle: "italic",
          paddingLeft: 4,
          paddingBottom: 6,
        },
        conamaStratum: {
          marginTop: 14,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border + "60",
        },
        conamaStratumTitle: {
          fontSize: 14,
          fontWeight: "700",
          color: colors.primary,
        },
        conamaStratumStage: {
          fontSize: 12,
          fontWeight: "600",
          color: colors.textSecondary,
          marginTop: 2,
        },
        conamaStratumMeta: {
          fontSize: 12,
          color: colors.textLight,
          marginTop: 2,
          marginBottom: 4,
        },
        threatRow: {
          backgroundColor: colors.warning + "1A",
          borderRadius: 8,
        },
        threatText: { color: colors.warning },
        actionRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
        actionBtn: {
          flex: 1, borderRadius: 10, padding: 14, alignItems: "center",
        },
        actionText: { color: colors.white, fontSize: 14, fontWeight: "700" },
        shareBtn: {
          backgroundColor: colors.primary,
          borderRadius: 10,
          padding: 16,
          alignItems: "center",
          marginTop: 8,
        },
        shareText: { color: colors.white, fontSize: 16, fontWeight: "700" },
      }),
    [colors]
  );
}
