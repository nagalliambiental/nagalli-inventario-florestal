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
import { createPlot } from "../db/database";
import { colors } from "../constants/colors";
import type { RootStackParamList } from "../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "PlotForm">;

export function PlotFormScreen({ route, navigation }: Props) {
  const { projectId } = route.params;
  const [code, setCode] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [shape, setShape] = useState("");
  const [notes, setNotes] = useState("");

  const handleSave = async () => {
    if (!code.trim()) {
      Alert.alert("Código obrigatório");
      return;
    }
    await createPlot({
      projectId,
      code: code.trim(),
      areaM2: parseFloat((areaM2 || "").replace(",", ".")) || 0,
      shape: shape.trim(),
      coordinates: "",
      notes: notes.trim(),
    });
    navigation.goBack();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Código da parcela *</Text>
      <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="Ex: P-01" />

      <Text style={styles.label}>Área (m²)</Text>
      <TextInput
        style={styles.input}
        value={areaM2}
        onChangeText={setAreaM2}
        keyboardType="decimal-pad"
        placeholder="Ex: 400"
      />

      <Text style={styles.label}>Forma</Text>
      <TextInput style={styles.input} value={shape} onChangeText={setShape} placeholder="Circular, retangular..." />

      <Text style={styles.label}>Observações</Text>
      <TextInput style={styles.input} value={notes} onChangeText={setNotes} multiline numberOfLines={3} />

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
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 32,
  },
  saveText: { color: colors.white, fontSize: 17, fontWeight: "700" },
});
