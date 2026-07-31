import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../constants/colors";
import { fmtCm, fmtM } from "../utils/formats";
import type { Tree } from "../types";

interface Props {
  tree: Tree;
  onPress: () => void;
  onLongPress: () => void;
}

export function TreeCard({ tree, onPress, onLongPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.header}>
        <Text style={styles.number}>#{tree.number}</Text>
        <Text style={styles.species}>
          {tree.speciesName || "Não identificada"}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.meta}>CAP: {fmtCm(tree.capCm)}</Text>
        <Text style={styles.meta}>DAP: {fmtCm(tree.dbhCm)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.meta}>Alt. comercial: {fmtM(tree.heightComercialM)}</Text>
        <Text style={styles.meta}>Alt. total: {fmtM(tree.heightTotalM)}</Text>
      </View>
      {tree.fustes && tree.fustes.length > 1 && (
        <Text style={styles.fustes}>
          {tree.fustes.length} fustes • AB total:{" "}
          {tree.fustes.reduce((s, f) => s + f.basalAreaM2, 0).toFixed(4)} m²
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    elevation: 1,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  number: { fontSize: 16, fontWeight: "700", color: colors.text },
  species: {
    fontSize: 15,
    color: colors.textSecondary,
    fontStyle: "italic",
    flex: 1,
  },
  row: { flexDirection: "row", gap: 12, marginTop: 6 },
  meta: { fontSize: 13, color: colors.textLight },
  fustes: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
});
