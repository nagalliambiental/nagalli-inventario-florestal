import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from "react-native";
import { captureRef } from "react-native-view-shot";
import { formatUtm } from "../utils/utm";

const LOGO = require("../../assets/icon.png");

interface Props {
  uri: string;
  width: number;
  height: number;
  caption?: string;
  latitude?: number;
  longitude?: number;
  onDone: (uri: string | null) => void;
}

const MAX_DISPLAY_W = 1080;
const FALLBACK_TIMEOUT_MS = 8000;

// Exibe a foto em tela cheia com a marca d'água da Nagalli Ambiental
// (logo + data/hora local + coordenada UTM + legenda) e captura o resultado.
// Capturar uma view VISÍVEL (e não offscreen) evita imagem preta no Android.
export function PhotoWatermark({
  uri,
  width,
  height,
  caption,
  latitude,
  longitude,
  onDone,
}: Props) {
  const ref = useRef<View>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Reduz a tela de captura para acelerar o view-shot; a escala (s) mantém
  // a marca d'água proporcional à resolução final.
  const scale = Math.min(1, MAX_DISPLAY_W / width);
  const displayW = Math.round(width * scale);
  const displayH = Math.round(height * scale);
  const s = Math.max(0.6, Math.min(1.6, displayW / 1200));

  useEffect(() => {
    if (!loaded && !failed) return;
    let cancelled = false;
    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      if (!cancelled) onDone(result);
    };

    // Garante que o modal SEMPRE fecha, mesmo se a captura falhar.
    const timeout = setTimeout(() => finish(null), FALLBACK_TIMEOUT_MS);

    const run = async () => {
      try {
        await new Promise((r) => setTimeout(r, failed ? 300 : 150));
        if (failed) {
          finish(null);
          return;
        }
        if (!ref.current) {
          finish(null);
          return;
        }
        const result = await captureRef(ref, {
          format: "png",
          quality: 1,
          result: "tmpfile",
        });
        finish(result);
      } catch {
        finish(null);
      }
    };
    run();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [loaded, failed]);

  const now = new Date();
  const datetime = `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}`;
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude || 0) !== 0;
  const utm = hasCoords ? formatUtm(latitude!, longitude!) : "";

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View
          ref={ref}
          collapsable={false}
          style={[styles.capture, { width: displayW, height: displayH }]}
        >
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
          <View style={[styles.badge, { top: 12 * s, left: 12 * s }]}>
            <Image
              source={LOGO}
              style={{ width: 42 * s, height: 42 * s, borderRadius: 8 * s }}
            />
            <View style={{ marginLeft: 8 * s }}>
              <Text style={[styles.badgeTitle, { fontSize: 15 * s }]}>
                NAGALLI AMBIENTAL
              </Text>
              <Text style={[styles.badgeSub, { fontSize: 10 * s }]}>
                Inventário Florestal
              </Text>
            </View>
          </View>
          <View style={[styles.footer, { paddingVertical: 8 * s }]}>
            {caption ? (
              <Text style={[styles.footerCaption, { fontSize: 12 * s }]}>
                {caption}
              </Text>
            ) : null}
            <Text style={[styles.footerTime, { fontSize: 13 * s }]}>
              📷 {datetime}
              {utm ? ` • UTM ${utm}` : " • NAGALLI AMBIENTAL"}
            </Text>
            {utm ? (
              <Text style={[styles.footerCoords, { fontSize: 10 * s }]}>
                {Number(latitude).toFixed(6)}, {Number(longitude).toFixed(6)}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.progress}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.progressText}>
            {failed
              ? "Não foi possível carregar a foto"
              : "Aplicando marca d'água..."}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  capture: { backgroundColor: "#000" },
  badge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    padding: 10,
  },
  badgeTitle: { color: "#fff", fontWeight: "800" },
  badgeSub: { color: "#dcdcdc" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
  },
  footerCaption: {
    color: "#fff",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  footerTime: {
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: 8,
    marginTop: 2,
  },
  footerCoords: {
    color: "#dcdcdc",
    textAlign: "center",
    paddingHorizontal: 8,
    marginTop: 1,
  },
  progress: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
  },
  progressText: { color: "#fff", fontSize: 14, marginLeft: 10 },
});
