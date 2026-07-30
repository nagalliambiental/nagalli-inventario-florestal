import React, { useState, useRef } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import { colors } from "../constants/colors";

interface Props {
  onPhoto: (uri: string) => void;
  currentUri?: string;
}

export function PhotoCapture({ onPhoto, currentUri }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    const result = await cameraRef.current.takePictureAsync({ base64: false });
    if (result?.uri) {
      onPhoto(result.uri);
      setShowCamera(false);
    }
  };

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <TouchableOpacity style={styles.btn} onPress={requestPermission}>
        <Text style={styles.btnText}>Permitir Câmera</Text>
      </TouchableOpacity>
    );
  }

  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.cameraOverlay}>
            <TouchableOpacity style={styles.captureBtn} onPress={takePhoto}>
              <View style={styles.innerCircle} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCamera(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <View>
      <TouchableOpacity style={styles.btn} onPress={() => setShowCamera(true)}>
        <Text style={styles.btnText}>{currentUri ? "📸 Refotografar" : "📸 Fotografar"}</Text>
      </TouchableOpacity>
      {currentUri && <Image source={{ uri: currentUri }} style={styles.preview} />}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  btnText: { color: colors.white, fontWeight: "600", fontSize: 15 },
  cameraContainer: { height: 350, borderRadius: 12, overflow: "hidden" },
  camera: { flex: 1 },
  cameraOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 24,
  },
  captureBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: colors.white,
    justifyContent: "center",
    alignItems: "center",
  },
  innerCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.white,
  },
  cancelBtn: { marginTop: 12, padding: 8 },
  cancelText: { color: colors.white, fontSize: 14 },
  preview: { width: "100%", height: 200, borderRadius: 8, marginTop: 8 },
});
