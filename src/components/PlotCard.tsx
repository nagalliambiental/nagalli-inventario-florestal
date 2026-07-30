import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../constants/colors";
import { fmtDate } from "../utils/formats";
import type { Plot } from "../types";

interface Props {
  plot: Plot;
  onPress: () => void;
  onLongPress: () => void;
}

export function PlotCard({ plot, onPress, onLongPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <Text style={styles.code}>{plot.code}</Text>
      {plot.areaM2 > 0 && <Text style={styles.meta}>{plot.areaM2} m²</Text>}
      {plot.shape ? <Text style={styles.meta}>{plot.shape}</Text> : null}
      <Text style={styles.date}>{fmtDate(plot.createdAt)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.secondary,
    elevation: 1,
  },
  code: { fontSize: 16, fontWeight: "600", color: colors.text },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  date: { fontSize: 11, color: colors.textLight, marginTop: 4 },
});
