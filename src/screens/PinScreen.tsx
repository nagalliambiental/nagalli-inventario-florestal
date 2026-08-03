import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { colors } from "../constants/colors";
import { isPinSet, setPin, verifyPin, removePin } from "../utils/auth";

export function PinScreen() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPinState] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    isPinSet().then(setConfigured);
  }, []);

  const clean = (v: string) => v.replace(/[^0-9]/g, "");

  const save = async () => {
    if (configured && !(await verifyPin(currentPin))) {
      Alert.alert("Erro", "PIN atual incorreto.");
      return;
    }
    if (pin.length < 4) {
      Alert.alert("Erro", "O PIN deve ter pelo menos 4 dígitos.");
      return;
    }
    if (pin !== confirm) {
      Alert.alert("Erro", "Os PINs não conferem.");
      return;
    }
    await setPin(pin);
    Alert.alert("OK", "PIN atualizado.", [
      { text: "OK", onPress: () => reset() },
    ]);
  };

  const reset = async () => {
    setCurrentPin("");
    setPinState("");
    setConfirm("");
    setConfigured(await isPinSet());
  };

  const remove = async () => {
    if (!(await verifyPin(currentPin))) {
      Alert.alert("Erro", "PIN atual incorreto.");
      return;
    }
    Alert.alert(
      "Remover PIN",
      "O acesso deixará de ser bloqueado. Confirmar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            await removePin();
            Alert.alert("OK", "PIN removido.", [
              { text: "OK", onPress: () => reset() },
            ]);
          },
        },
      ]
    );
  };

  if (configured === null) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Segurança do app</Text>
      <Text style={styles.hint}>
        Com um PIN definido, o app pede o código na abertura para proteger os
        dados do inventário em caso de troca de funcionário.
      </Text>

      {configured ? (
        <>
          <Text style={styles.label}>PIN atual</Text>
          <TextInput
            style={styles.input}
            value={currentPin}
            onChangeText={(t) => setCurrentPin(clean(t))}
            secureTextEntry
            keyboardType="number-pad"
            placeholder="PIN atual"
            placeholderTextColor={colors.textLight}
          />
        </>
      ) : (
        <Text style={styles.notice}>Nenhum PIN definido ainda.</Text>
      )}

      <Text style={styles.label}>Novo PIN</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={(t) => setPinState(clean(t))}
        secureTextEntry
        keyboardType="number-pad"
        placeholder="Mínimo 4 dígitos"
        placeholderTextColor={colors.textLight}
      />

      <Text style={styles.label}>Confirmar PIN</Text>
      <TextInput
        style={styles.input}
        value={confirm}
        onChangeText={(t) => setConfirm(clean(t))}
        secureTextEntry
        keyboardType="number-pad"
        placeholder="Repita o PIN"
        placeholderTextColor={colors.textLight}
      />

      <TouchableOpacity style={styles.saveBtn} onPress={save}>
        <Text style={styles.saveText}>
          {configured ? "Atualizar PIN" : "Definir PIN"}
        </Text>
      </TouchableOpacity>

      {configured && (
        <TouchableOpacity style={styles.removeBtn} onPress={remove}>
          <Text style={styles.removeText}>Remover PIN</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.warning}>
        Atenção: o PIN não pode ser recuperado se for esquecido. Guarde-o com o
        administrador.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  title: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 8 },
  hint: { fontSize: 14, color: colors.textSecondary, marginBottom: 16, lineHeight: 20 },
  notice: { fontSize: 14, color: colors.warning, marginBottom: 12 },
  label: { fontSize: 13, color: colors.textSecondary, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 18,
    letterSpacing: 4,
    color: colors.text,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 24,
    alignItems: "center",
  },
  saveText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  removeBtn: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 12,
    alignItems: "center",
  },
  removeText: { color: colors.error, fontSize: 15, fontWeight: "600" },
  warning: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: 20,
    lineHeight: 18,
  },
});
