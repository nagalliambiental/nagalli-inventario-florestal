import React from "react";
import { View, Text, StyleSheet } from "react-native";

// Barra horizontal para IVI e volumes por espécie.
export function HBarChart({
  data,
  maxValue,
  formatValue,
  colors,
}: {
  data: { label: string; value: number }[];
  maxValue?: number;
  formatValue?: (v: number) => string;
  colors: { primary: string; border: string; text: string; textSecondary: string };
}) {
  const max = maxValue ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={styles.hChart}>
      {data.map((d, i) => (
        <View key={i} style={styles.hRow}>
          <Text style={[styles.hLabel, { color: colors.text }]} numberOfLines={1}>
            {d.label}
          </Text>
          <View style={[styles.hTrack, { backgroundColor: colors.border + "55" }]}>
            <View
              style={[
                styles.hBar,
                {
                  width: `${Math.max(2, (d.value / max) * 100)}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
          <Text style={[styles.hValue, { color: colors.text }]}>
            {formatValue ? formatValue(d.value) : d.value.toFixed(1)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Gráfico de barras verticais (ex.: distribuição diamétrica).
export function VBarChart({
  data,
  formatLabel,
  formatValue,
  colors,
}: {
  data: { label: string; value: number }[];
  formatLabel?: (l: string) => string;
  formatValue?: (v: number) => string;
  colors: { primary: string; border: string; text: string; textSecondary: string };
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const chartHeight = 140;
  return (
    <View style={styles.vChart}>
      {data.map((d, i) => (
        <View key={i} style={styles.vColumn}>
          <Text style={[styles.vCount, { color: colors.textSecondary }]}>
            {d.value > 0 ? d.value : ""}
          </Text>
          <View style={[styles.vTrack, { height: chartHeight }]}>
            <View
              style={[
                styles.vBar,
                {
                  height: Math.max(2, (d.value / max) * chartHeight),
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
          <Text style={[styles.vLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            {formatLabel ? formatLabel(d.label) : d.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hChart: { gap: 8, marginTop: 8 },
  hRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hLabel: {
    width: 110,
    fontSize: 12,
    fontStyle: "italic",
  },
  hTrack: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    overflow: "hidden",
  },
  hBar: { height: 14, borderRadius: 7 },
  hValue: { width: 56, fontSize: 12, fontWeight: "700", textAlign: "right" },
  vChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 8,
  },
  vColumn: { flex: 1, alignItems: "center" },
  vCount: { fontSize: 11, height: 16 },
  vTrack: { width: "70%", justifyContent: "flex-end" },
  vBar: { width: "100%", borderRadius: 4, minWidth: 8 },
  vLabel: {
    fontSize: 10,
    marginTop: 4,
    textAlign: "center",
    width: "100%",
  },
});
