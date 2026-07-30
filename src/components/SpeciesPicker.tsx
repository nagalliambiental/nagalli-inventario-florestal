import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
} from "react-native";
import { colors } from "../constants/colors";
import { phytoOptions } from "../utils/formats";
import type { Species } from "../types";

interface Props {
  speciesList: Species[];
  phytoFilter: string;
  onSelect: (species: Species) => void;
  onPhytoChange: (phyto: string) => void;
  visible: boolean;
  onClose: () => void;
}

export function SpeciesPicker({
  speciesList,
  phytoFilter,
  onSelect,
  onPhytoChange,
  visible,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.modal}>
        <View style={styles.header}>
          <Text style={styles.title}>Selecionar espécie</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>Fechar</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.filterRow}>
          {phytoOptions.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.filterBtn, phytoFilter === p && styles.filterActive]}
              onPress={() => onPhytoChange(p)}
            >
              <Text
                style={[
                  styles.filterText,
                  phytoFilter === p && styles.filterTextActive,
                ]}
              >
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <FlatList
          data={speciesList}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.item}
              onPress={() => onSelect(item)}
            >
              <Text style={styles.sciName}>{item.scientificName}</Text>
              <Text style={styles.popName}>
                {item.popularName} • {item.family}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>Nenhuma espécie</Text>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  close: { fontSize: 16, color: colors.primary, fontWeight: "600" },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 12,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, color: colors.textSecondary },
  filterTextActive: { color: colors.white, fontWeight: "600" },
  item: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  sciName: { fontSize: 16, color: colors.text, fontStyle: "italic" },
  popName: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  empty: { textAlign: "center", color: colors.textLight, marginTop: 40 },
});
