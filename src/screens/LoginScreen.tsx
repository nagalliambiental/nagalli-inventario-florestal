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
import { getConfig, setConfig } from "../db/database";

const ACCEPTED_KEY = "accepted_terms";

export function LoginScreen() {
  const { isDark } = useTheme();
  const { login } = useUser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [termsLoaded, setTermsLoaded] = useState(false);

  React.useEffect(() => {
    getConfig(ACCEPTED_KEY).then((v) => {
      setAccepted(v === "1");
      setTermsLoaded(true);
    });
  }, []);

  const submit = async () => {
    if (!accepted) {
      setError("É preciso aceitar os termos de uso para entrar.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setBusy(true);
    setError("");
    if (accepted) await setConfig(ACCEPTED_KEY, "1");
    const err = await login(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
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
        <Text style={styles.lockLabel}>Acesso restrito</Text>

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
          style={[styles.button, (!email || !password || !accepted) && { opacity: 0.5 }]}
          onPress={submit}
          disabled={busy || !email || !password || !accepted || !termsLoaded}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.acceptRow}
          onPress={() => setAccepted(!accepted)}
          disabled={busy}
        >
          <View style={[styles.checkbox, accepted && styles.checkboxOn]}>
            {accepted ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </View>
          <Text style={styles.acceptText}>
            Li e aceito os termos de uso e a proibição de cópia e distribuição.
          </Text>
        </TouchableOpacity>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>DIREITOS AUTORAIS E PROIBIÇÃO DE CÓPIA</Text>
          <Text style={styles.noticeText}>
            Os projetos e dados deste aplicativo constituem acervo técnico
            protegido pelas Leis nº 9.610/98 (Direitos Autorais) e nº 13.709/18
            (LGPD). É proibida a cópia e/ou distribuição total ou parcial, por
            qualquer meio, inclusive por ferramentas de Inteligência Artificial.
            Todos os direitos de uso, cópia e comercialização são reservados à
            Nagalli Ambiental Ltda.
          </Text>
        </View>

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
  acceptRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginHorizontal: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxMark: { color: colors.white, fontSize: 15, fontWeight: "800", lineHeight: 18 },
  acceptText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  notice: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.surface,
  },
  noticeTitle: { fontSize: 11, fontWeight: "800", color: colors.error, marginBottom: 4 },
  noticeText: { fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
  hint: { fontSize: 12, color: colors.textLight, textAlign: "center", marginTop: 20, lineHeight: 17 },
});
