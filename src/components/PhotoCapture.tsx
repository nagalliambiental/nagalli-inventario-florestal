import React, { useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { colors } from "../constants/colors";
import { PhotoWatermark } from "./PhotoWatermark";
import { persistPhoto } from "../utils/photos";

interface Props {
  onPhoto: (uri: string) => void;
  caption?: string;
  buttonLabel?: string;
}

interface Pending {
  uri: string;
  width: number;
  height: number;
  caption?: string;
}

const MAX_DIM = 1600;

export function PhotoCapture({ onPhoto, caption, buttonLabel }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const finalize = async (watermarked: string | null, fallback: Pending) => {
    let uri = fallback.uri;
    if (watermarked) {
      try {
        // PNG do view-shot → JPEG compactado e persistente
        const jpeg = await ImageManipulator.manipulateAsync(
          watermarked,
          [],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
        );
        uri = await persistPhoto(jpeg.uri);
      } catch {
        uri = await persistPhoto(watermarked);
      }
    } else {
      try {
        uri = await persistPhoto(fallback.uri);
      } catch {}
    }
    onPhoto(uri);
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    const result = await cameraRef.current.takePictureAsync({ base64: false });
    if (!result?.uri) return;
    setShowCamera(false);

    try {
      let processed = await ImageManipulator.manipulateAsync(
        result.uri,
        [],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      const maxDim = Math.max(processed.width, processed.height);
      if (maxDim > MAX_DIM) {
        const scale = MAX_DIM / maxDim;
        processed = await ImageManipulator.manipulateAsync(
          processed.uri,
          [
            {
              resize: {
                width: Math.round(processed.width * scale),
                height: Math.round(processed.height * scale),
              },
            },
          ],
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );
      }
      const pendingData: Pending = {
        uri: processed.uri,
        width: processed.width,
        height: processed.height,
        caption,
      };
      setPending(pendingData);
    } catch {
      onPhoto(result.uri);
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

  return (
    <View>
      {showCamera && (
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
      )}

      {!showCamera && (
        <TouchableOpacity style={styles.btn} onPress={() => setShowCamera(true)}>
          <Text style={styles.btnText}>📸 {buttonLabel || "Fotografar"}</Text>
        </TouchableOpacity>
      )}

      {pending && (
        <PhotoWatermark
          uri={pending.uri}
          width={pending.width}
          height={pending.height}
          caption={pending.caption}
          onDone={async (watermarked) => {
            const snapshot = pending;
            setPending(null);
            await finalize(watermarked, snapshot);
          }}
        />
      )}
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
});
