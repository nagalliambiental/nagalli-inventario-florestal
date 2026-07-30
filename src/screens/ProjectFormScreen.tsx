import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getProject, createProject, updateProject } from "../db/database";
import { colors } from "../constants/colors";
import { methodOptions } from "../utils/formats";
import type { RootStackParamList } from "../types/navigation";
import type { SurveyMethod } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectForm">;

export function ProjectFormScreen({ route, navigation }: Props) {
  const projectId = route.params?.projectId;
  const isEdit = !!projectId;

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [areaHa, setAreaHa] = useState("");
  const [method, setMethod] = useState<SurveyMethod>("parcelas_fixas");

  useEffect(() => {
    if (projectId) {
      getProject(projectId).then((p) => {
        if (p) {
          setName(p.name);
          setClient(p.client || "");
          setLocation(p.location || "");
          setAreaHa(String(p.areaHa || ""));
          setMethod(p.method);
        }
      });
    }
  }, [projectId]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Nome obrigatório");
      return;
    }
    const data = {
      name: name.trim(),
      client: client.trim(),
      location: location.trim(),
      method,
      areaHa: parseFloat(areaHa) || 0,
    };
    if (isEdit) {
      await updateProject(projectId!, data);
    } else {
      await createProject(data);
    }
    navigation.goBack();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Nome do projeto *</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ex: Fazenda Boa Vista" />

      <Text style={styles.label}>Cliente</Text>
      <TextInput style={styles.input} value={client} onChangeText={setClient} placeholder="Nome do cliente" />

      <Text style={styles.label}>Localização</Text>
      <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="Município / UF" />

      <Text style={styles.label}>Método</Text>
      <View style={styles.methodRow}>
        {methodOptions.map((m) => (
          <TouchableOpacity
            key={m.value}
            style={[styles.methodBtn, method === m.value && styles.methodBtnActive]}
            onPress={() => setMethod(m.value as SurveyMethod)}
          >
            <Text style={[styles.methodText, method === m.value && styles.methodTextActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Área (ha)</Text>
      <TextInput
        style={styles.input}
        value={areaHa}
        onChangeText={setAreaHa}
        keyboardType="decimal-pad"
        placeholder="0,0"
      />

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveText}>Salvar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: 16, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodText: { fontSize: 13, color: colors.textSecondary },
  methodTextActive: { color: colors.white, fontWeight: "600" },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 32,
  },
  saveText: { color: colors.white, fontSize: 17, fontWeight: "700" },
});
