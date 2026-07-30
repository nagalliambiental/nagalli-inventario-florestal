import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { initDatabase } from "./src/db/database";
import { seedSpecies } from "./src/db/seed";
import * as SQLite from "expo-sqlite";
import { colors } from "./src/constants/colors";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ProjectFormScreen } from "./src/screens/ProjectFormScreen";
import { ProjectScreen } from "./src/screens/ProjectScreen";
import { PlotFormScreen } from "./src/screens/PlotFormScreen";
import { PlotScreen } from "./src/screens/PlotScreen";
import { TreeFormScreen } from "./src/screens/TreeFormScreen";
import { ReportScreen } from "./src/screens/ReportScreen";
import type { RootStackParamList } from "./src/types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <View style={styles.center}>
        <Text style={styles.error}>Erro: {error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loading}>{error || "Inicializando..."}</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: "600" },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: "Inventário Florestal" }}
        />
        <Stack.Screen
          name="ProjectForm"
          component={ProjectFormScreen}
          options={({ route }) => ({
            title: route.params?.projectId ? "Editar projeto" : "Novo projeto",
          })}
        />
        <Stack.Screen
          name="Project"
          component={ProjectScreen}
          options={({ route }) => ({ title: "Projeto" })}
        />
        <Stack.Screen
          name="PlotForm"
          component={PlotFormScreen}
          options={{ title: "Nova parcela" }}
        />
        <Stack.Screen
          name="Plot"
          component={PlotScreen}
          options={{ title: "Parcela" }}
        />
        <Stack.Screen
          name="TreeForm"
          component={TreeFormScreen}
          options={({ route }) => ({
            title: route.params?.treeId ? "Editar árvore" : "Nova árvore",
          })}
        />
        <Stack.Screen
          name="Report"
          component={ReportScreen}
          options={{ title: "Relatórios" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  error: { color: colors.error, fontSize: 16 },
  loading: { color: colors.textSecondary, fontSize: 15, marginTop: 12 },
});
