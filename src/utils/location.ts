import * as Location from "expo-location";

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

// Faz uma leitura somente quando o usuário solicita. Não reutiliza a posição
// de outra árvore nem tenta corrigir automaticamente uma leitura ruim.
export async function getCurrentCoords(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    if (!Number.isFinite(loc.coords.latitude) || !Number.isFinite(loc.coords.longitude)) {
      return null;
    }
    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    };
  } catch {
    return null;
  }
}
