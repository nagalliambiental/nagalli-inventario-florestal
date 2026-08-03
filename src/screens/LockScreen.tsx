import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from "react-native";
import { colors } from "../constants/colors";
import { useTheme } from "../contexts/ThemeContext";
import { verifyPin } from "../utils/auth";

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { isDark } = useTheme();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!pin) return;
    setBusy(true);
    setError("");
    const ok = await verifyPin(pin);
    setBusy(false);
    if (ok) {
      setPin("");
      onUnlock();
    } else {
      setError("PIN incorreto. Tente novamente.");
      setPin("");
    }
  };

  const bg = isDark ? "#111111" : colors.background;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Image
        source={require("../../assets/icon.png")}
        style={styles.logo}
      />
      <Text style={styles.brand}>NAGALLI AMBIENTAL</Text>
      <Text style={styles.subtitle}>Inventário Florestal</Text>
      <Text style={styles.label}>Acesso protegido por PIN</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={(t) => setPin(t.replace(/[^0-9]/g, ""))}
        placeholder="Digite o PIN"
        placeholderTextColor={colors.textLight}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={10}
        autoFocus
        onSubmitEditing={submit}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        style={styles.button}
        onPress={submit}
        disabled={busy || !pin}
      >
        {busy ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonText}>Desbloquear</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  logo: { width: 96, height: 96, marginBottom: 16 },
  brand: { fontSize: 22, fontWeight: "800", color: colors.primary },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  label: { fontSize: 14, color: colors.text, marginTop: 32, marginBottom: 12 },
  input: {
    width: "100%",
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    fontSize: 20,
    letterSpacing: 6,
    color: colors.text,
    textAlign: "center",
  },
  error: { color: colors.error, marginTop: 12, fontSize: 14 },
  button: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
});
