import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { colors } from "../constants/colors";
import { useTheme } from "../contexts/ThemeContext";
import { useUser } from "../contexts/UserContext";
import { apiBootstrap, apiRegister } from "../api/auth";

export function LoginScreen() {
  const { isDark } = useTheme();
  const { login } = useUser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [showSetup, setShowSetup] = useState(false);
  const [name, setName] = useState("");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setBusy(true);
    setError("");
    const err = await login(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
  };

  const openSetup = async () => {
    setError("");
    try {
      const res = await apiBootstrap();
      if (res.users > 0) {
        setError("Já existe administrador. Peça a ele para criar a sua conta.");
        setShowSetup(false);
        return;
      }
      setShowSetup(true);
    } catch (e: any) {
      setError(e?.message || "Sem conexão com o servidor.");
    }
  };

  const createAdmin = async () => {
    if (!name.trim() || !setupEmail.trim() || setupPassword.length < 6) {
      setError("Preencha nome, e-mail e senha com pelo menos 6 caracteres.");
      return;
    }
    setSetupBusy(true);
    setError("");
    try {
      await apiRegister(null, {
        name: name.trim(),
        email: setupEmail.trim(),
        password: setupPassword,
        role: "admin",
      });
      const err = await login(setupEmail.trim(), setupPassword);
      if (err) setError(err);
    } catch (e: any) {
      setError(e?.message || "Não foi possível criar a conta.");
    } finally {
      setSetupBusy(false);
    }
  };

  const bg = isDark ? "#111111" : colors.background;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>NAGALLI AMBIENTAL</Text>
        <Text style={styles.subtitle}>Inventário Florestal</Text>
        <Text style={styles.lockLabel}>
          {showSetup ? "Primeiro acesso" : "Acesso restrito"}
        </Text>

        {showSetup ? (
          <>
            <Text style={styles.label}>Nome</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              placeholderTextColor={colors.textLight}
            />
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              style={styles.input}
              value={setupEmail}
              onChangeText={setSetupEmail}
              placeholder="seu@email.com"
              placeholderTextColor={colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <Text style={styles.label}>Senha</Text>
            <TextInput
              style={styles.input}
              value={setupPassword}
              onChangeText={setSetupPassword}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={colors.textLight}
              secureTextEntry
            />
            <TouchableOpacity
              style={[styles.button, setupBusy && { opacity: 0.6 }]}
              onPress={createAdmin}
              disabled={setupBusy}
            >
              {setupBusy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Criar conta de administrador</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowSetup(false); setError(""); }}>
              <Text style={styles.backLink}>Voltar para o login</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
              placeholderTextColor={colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <Text style={styles.label}>Senha</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Senha"
              placeholderTextColor={colors.textLight}
              secureTextEntry
              onSubmitEditing={submit}
            />
            <TouchableOpacity
              style={[styles.button, (!email || !password) && { opacity: 0.5 }]}
              onPress={submit}
              disabled={busy || !email || !password}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Entrar</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={openSetup} disabled={busy}>
              <Text style={styles.setupLink}>
                Primeiro acesso? Criar conta de administrador
              </Text>
            </TouchableOpacity>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.hint}>
          É preciso conexão com a internet apenas para entrar. Depois, o app
          continua funcionando sem sinal no campo.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  brand: { fontSize: 22, fontWeight: "800", color: colors.primary, textAlign: "center" },
  subtitle: { fontSize: 13, color: colors.textSecondary, textAlign: "center", marginTop: 2 },
  lockLabel: { fontSize: 14, color: colors.text, textAlign: "center", marginTop: 24, marginBottom: 8 },
  label: { fontSize: 13, color: colors.textSecondary, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    height: 50,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
  },
  error: { color: colors.error, marginTop: 12, fontSize: 14, textAlign: "center" },
  button: {
    marginTop: 24,
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  setupLink: {
    color: colors.primary,
    textAlign: "center",
    marginTop: 18,
    fontSize: 14,
    fontWeight: "600",
  },
  backLink: {
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 14,
    fontSize: 14,
  },
  hint: { fontSize: 12, color: colors.textLight, textAlign: "center", marginTop: 20, lineHeight: 17 },
});
