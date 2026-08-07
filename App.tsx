import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { initDatabase } from "./src/db/database";
import { seedSpecies } from "./src/db/seed";
import * as SQLite from "expo-sqlite";
import { colors } from "./src/constants/colors";
import { ThemeProvider, useTheme } from "./src/contexts/ThemeContext";
import { UserProvider, useUser } from "./src/contexts/UserContext";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ProjectFormScreen } from "./src/screens/ProjectFormScreen";
import { ProjectScreen } from "./src/screens/ProjectScreen";
import { PlotFormScreen } from "./src/screens/PlotFormScreen";
import { PlotScreen } from "./src/screens/PlotScreen";
import { TreeFormScreen } from "./src/screens/TreeFormScreen";
import { ReportScreen } from "./src/screens/ReportScreen";
import { PinScreen } from "./src/screens/PinScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { useAutoSync } from "./src/utils/useAutoSync";
import type { RootStackParamList } from "./src/types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppContent() {
  const { colors } = useTheme();
  const { locked, ready: authReady, token } = useUser();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useAutoSync(token, !locked && authReady && ready);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await initDatabase();
        if (cancelled) return;
        await seedSpecies(db);
        if (cancelled) return;
        setReady(true);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e) || "Erro ao inicializar");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.error, { color: colors.error }]}>Erro: {error}</Text>
      </View>
    );
  }

  if (!ready || !authReady) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loading, { color: colors.textSecondary }]}>Inicializando...</Text>
      </View>
    );
  }

  if (locked) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: "600" },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: "Inventário Florestal" }} />
        <Stack.Screen name="ProjectForm" component={ProjectFormScreen} options={({ route }) => ({ title: route.params?.projectId ? "Editar projeto" : "Novo projeto" })} />
        <Stack.Screen name="Project" component={ProjectScreen} options={{ title: "Projeto" }} />
        <Stack.Screen name="PlotForm" component={PlotFormScreen} options={{ title: "Nova parcela" }} />
        <Stack.Screen name="Plot" component={PlotScreen} options={{ title: "Parcela" }} />
        <Stack.Screen name="TreeForm" component={TreeFormScreen} options={({ route }) => ({ title: route.params?.treeId ? "Editar árvore" : "Nova árvore" })} />
        <Stack.Screen name="Report" component={ReportScreen} options={{ title: "Relatórios" }} />
        <Stack.Screen name="Users" component={PinScreen} options={{ title: "Acesso e usuários" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <UserProvider>
        <AppContent />
      </UserProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  error: { fontSize: 16 },
  loading: { fontSize: 15, marginTop: 12 },
});
