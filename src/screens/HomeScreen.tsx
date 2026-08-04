import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  type AlertButton,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import { listProjects, getProject, deleteProject } from "../db/database";
import { colors } from "../constants/colors";
import { fmtDate, methodLabel } from "../utils/formats";
import { importProjectBackup, importExcelData } from "../utils/backup";
import { syncNow } from "../utils/sync";
import { useUser } from "../contexts/UserContext";
import type { Project } from "../types";
import type { RootStackParamList } from "../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const { user, isAdmin, logout, token } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [syncing, setSyncing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listProjects().then(setProjects);
    }, [])
  );

  const handleSync = async () => {
    if (!token || syncing) return;
    setSyncing(true);
    try {
      const r = await syncNow(token);
      listProjects().then(setProjects);
      Alert.alert(
        "Sincronizado",
        r.pushed === 0 && r.pulled === 0
          ? "Tudo em dia."
          : `Enviados ${r.pushed} e baixados ${r.pulled} registros.`
      );
    } catch (e: any) {
      Alert.alert(
        "Falha na sincronização",
        e?.message || "Sem conexão com o servidor. Tente novamente quando tiver sinal."
      );
    } finally {
      setSyncing(false);
    }
  };

  const openImport = () => {
    Alert.alert("Importar dados", "O que você quer importar?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Backup do projeto (.zip)",
        onPress: () => pickAndImport("backup"),
      },
      {
        text: "Planilha de campo (.xlsx)",
        onPress: () => pickAndImport("excel"),
      },
    ]);
  };

  const pickAndImport = async (kind: "backup" | "excel") => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type:
          kind === "backup"
            ? ["application/zip", "application/octet-stream"]
            : [
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "application/octet-stream",
              ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const createdBy = user?.name || "";
      let newId: string;
      if (kind === "backup") {
        newId = await importProjectBackup(asset.uri, createdBy);
      } else {
        const baseName = (asset.name || "planilha")
          .replace(/\.xlsx$/i, "")
          .replace(/\.xls$/i, "");
        newId = await importExcelData(asset.uri, baseName, createdBy);
      }
      const project = await getProject(newId);
      Alert.alert("Importação concluída", `Projeto "${project?.name}" criado com sucesso.`, [
        { text: "Fechar" },
        { text: "Abrir projeto", onPress: () => navigation.navigate("Project", { projectId: newId }) },
      ]);
    } catch (e: any) {
      Alert.alert("Erro na importação", e?.message || "Não foi possível importar o arquivo.");
    }
  };

  const handleLongPress = (item: Project) => {
    const actions: AlertButton[] = [
      {
        text: "Editar",
        onPress: () => navigation.navigate("ProjectForm", { projectId: item.id }),
      },
    ];
    if (isAdmin) {
      actions.push({
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          Alert.alert(
            "Excluir projeto",
            `Excluir "${item.name}"? Todos os dados (parcelas, árvores, fotos) serão removidos.`,
            [
              { text: "Cancelar", style: "cancel" },
              {
                text: "Excluir",
                style: "destructive",
                onPress: async () => {
                  try {
                    await deleteProject(item.id);
                    listProjects().then(setProjects);
                  } catch (e: any) {
                    Alert.alert("Erro", e?.message || "Não foi possível excluir o projeto.");
                  }
                },
              },
            ]
          );
        },
      });
    }
    actions.push({ text: "Cancelar", style: "cancel" });
    Alert.alert(item.name, undefined, actions);
  };

  const renderItem = ({ item }: { item: Project }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate("Project", { projectId: item.id })}
      onLongPress={() => handleLongPress(item)}
    >
      <Text style={styles.cardTitle}>{item.name}</Text>
      {item.client ? <Text style={styles.cardSub}>{item.client}</Text> : null}
      <Text style={styles.cardMeta}>
        {methodLabel(item.method)} • {item.areaHa} ha
      </Text>
      <Text style={styles.cardDate}>
        {fmtDate(item.createdAt)}
        {item.createdBy ? ` • Criado por ${item.createdBy}` : ""}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.toolBtn, styles.syncBtn]}
          onPress={handleSync}
          disabled={syncing}
        >
          <Text style={styles.toolText}>
            {syncing ? "⏳ Sincronizando..." : "🔄 Sincronizar"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn} onPress={logout}>
          <Text style={styles.toolText}>🚪 Sair</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolBtn} onPress={openImport}>
          <Text style={styles.toolText}>📥 Importar</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => navigation.navigate("Users")}
          >
            <Text style={styles.toolText}>👥 Usuários</Text>
          </TouchableOpacity>
        )}
      </View>
      {user && <Text style={styles.userName}>Olá, {user.name}</Text>}
      <FlatList
        data={projects}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Nenhum projeto ainda</Text>
        }
        renderItem={renderItem}
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
  toolbar: {
    flexDirection: "row",
    padding: 16,
    paddingBottom: 0,
    gap: 12,
  },
  userName: {
    color: colors.textSecondary,
    fontSize: 13,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  toolBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  syncBtn: { borderColor: colors.primary },
  toolText: { color: colors.primary, fontWeight: "600", fontSize: 14 },
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
