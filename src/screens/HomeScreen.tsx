import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { listProjects, deleteProject } from "../db/database";
import { colors } from "../constants/colors";
import { fmtDate, methodLabel } from "../utils/formats";
import type { Project } from "../types";
import type { RootStackParamList } from "../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);

  useFocusEffect(
    useCallback(() => {
      listProjects().then(setProjects);
    }, [])
  );

  const handleDelete = (id: number, name: string) => {
    Alert.alert("Excluir projeto", `Excluir "${name}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => deleteProject(id).then(() => listProjects().then(setProjects)) },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={projects}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Nenhum projeto ainda</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate("Project", { projectId: item.id })}
            onLongPress={() => handleDelete(item.id, item.name)}
          >
            <Text style={styles.cardTitle}>{item.name}</Text>
            {item.client ? <Text style={styles.cardSub}>{item.client}</Text> : null}
            <Text style={styles.cardMeta}>
              {methodLabel(item.method)} • {item.areaHa} ha
            </Text>
            <Text style={styles.cardDate}>{fmtDate(item.createdAt)}</Text>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("ProjectForm", {})}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, paddingBottom: 80 },
  empty: { textAlign: "center", color: colors.textLight, marginTop: 60, fontSize: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  cardSub: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  cardMeta: { fontSize: 13, color: colors.textLight, marginTop: 6 },
  cardDate: { fontSize: 12, color: colors.textLight, marginTop: 4 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: colors.white, fontSize: 28, lineHeight: 30 },
});
