import * as Location from "expo-location";

let lastCoords: { latitude: number; longitude: number } | null = null;

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export async function getCurrentCoords(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      timeout: 10000,
    });
    lastCoords = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    };
    return lastCoords;
  } catch {
    return lastCoords;
  }
}
