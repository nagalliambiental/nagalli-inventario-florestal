import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { colors } from "../constants/colors";
import { useUser } from "../contexts/UserContext";
import { apiListUsers, apiRegister, apiDeleteUser } from "../api/auth";
import { useFocusEffect } from "@react-navigation/native";

interface Account {
  uuid: string;
  email: string;
  name: string;
  role: string;
}

export function PinScreen() {
  const { token, isAdmin, user: me } = useUser();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);

  // Cadastro
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"worker" | "admin">("worker");

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [token])
  );

  const reload = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await apiListUsers(token);
      setAccounts(res.users || []);
      setOnline(true);
    } catch (e: any) {
      setOnline(false);
      Alert.alert("Offline", e?.message || "Não foi possível carregar as contas.");
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) {
      Alert.alert("Erro", "Preencha nome, e-mail válido e senha com pelo menos 6 caracteres.");
      return;
    }
    if (!token) return;
    try {
      await apiRegister(token, { name: name.trim(), email: email.trim(), password, role });
      Alert.alert("OK", "Conta criada.");
      setName("");
      setEmail("");
      setPassword("");
      reload();
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Não foi possível criar a conta.");
    }
  };

  const remove = (acc: Account) => {
    Alert.alert("Remover conta", `Remover "${acc.name}" (${acc.email})? O usuário não conseguirá mais entrar.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          try {
            await apiDeleteUser(token, acc.uuid);
            reload();
          } catch (e: any) {
            Alert.alert("Erro", e?.message || "Não foi possível remover.");
          }
        },
      },
    ]);
  };

  if (!isAdmin) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Administração de contas</Text>
      <Text style={styles.hint}>
        As contas ficam no servidor. Somente o administrador pode criar ou
        remover usuários. Funcionários entram com e-mail e senha.
      </Text>

      {!online && (
        <Text style={styles.offline}>
          Sem conexão com o servidor. As contas não podem ser gerenciadas offline.
        </Text>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contas cadastradas</Text>
        {loading && <ActivityIndicator color={colors.primary} />}
        {!loading && accounts.length === 0 && (
          <Text style={styles.empty}>Nenhuma conta ainda.</Text>
        )}
        {accounts.map((a) => (
          <View key={a.uuid} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>
                {a.name}{a.uuid === me?.uuid ? " (você)" : ""}
              </Text>
              <Text style={styles.rowMeta}>
                {a.email} • {a.role === "admin" ? "Administrador" : "Funcionário"}
              </Text>
            </View>
            {a.uuid !== me?.uuid && (
              <TouchableOpacity
                style={[styles.smallBtn, { borderColor: colors.error }]}
                onPress={() => remove(a)}
              >
                <Text style={[styles.smallBtnText, { color: colors.error }]}>Remover</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Criar nova conta</Text>
        <Text style={styles.label}>Nome</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Nome do usuário"
          placeholderTextColor={colors.textLight}
        />
        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="usuario@email.com"
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
          placeholder="Mínimo 6 caracteres"
          placeholderTextColor={colors.textLight}
          secureTextEntry
        />
        <Text style={styles.label}>Papel</Text>
        <View style={styles.roleRow}>
          {(["worker", "admin"] as const).map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.roleBtn, role === r && styles.roleActive]}
              onPress={() => setRole(r)}
            >
              <Text style={[styles.roleText, role === r && styles.roleTextActive]}>
                {r === "admin" ? "Administrador" : "Funcionário"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={create}>
          <Text style={styles.primaryBtnText}>Criar conta</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  title: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 6 },
  hint: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 12 },
  offline: {
    fontSize: 13,
    color: colors.warning,
    marginBottom: 12,
    padding: 10,
    backgroundColor: "#fff6e5",
    borderRadius: 8,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 10 },
  empty: { fontSize: 13, color: colors.textLight, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowName: { fontSize: 15, color: colors.text, fontWeight: "600" },
  rowMeta: { fontSize: 12, color: colors.textLight, marginTop: 2 },
  smallBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  smallBtnText: { fontSize: 13, fontWeight: "600" },
  label: { fontSize: 12, color: colors.textSecondary, marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text,
  },
  roleRow: { flexDirection: "row", gap: 8 },
  roleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  roleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleText: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
  roleTextActive: { color: colors.white },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 13,
    marginTop: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.white, fontWeight: "700", fontSize: 15 },
});
