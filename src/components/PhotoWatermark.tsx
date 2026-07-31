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

const LOGO = require("../../assets/icon.png");

interface Props {
  uri: string;
  width: number;
  height: number;
  caption?: string;
  onDone: (uri: string | null) => void;
}

// Exibe a foto em tela cheia com a marca d'água da Nagalli Ambiental
// (logo + data/hora da captura + legenda) e captura o resultado.
// Capturar uma view VISÍVEL (e não offscreen) evita imagem preta no Android.
export function PhotoWatermark({ uri, width, height, caption, onDone }: Props) {
  const ref = useRef<View>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const s = Math.max(0.6, Math.min(1.6, width / 1200));

  useEffect(() => {
    if (!loaded && !failed) return;
    let cancelled = false;
    const run = async () => {
      try {
        await new Promise((r) => setTimeout(r, failed ? 300 : 150));
        if (cancelled) return;
        if (failed) {
          onDone(null);
          return;
        }
        if (!ref.current) return;
        const result = await captureRef(ref, {
          format: "png",
          quality: 1,
          result: "tmpfile",
        });
        if (!cancelled) onDone(result);
      } catch {
        if (!cancelled) onDone(null);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [loaded, failed]);

  const now = new Date();
  const datetime = `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}`;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View
          ref={ref}
          collapsable={false}
          style={[styles.capture, { width, height }]}
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
            <Text style={[styles.footerCaption, { fontSize: 12 * s }]}>
              {caption || "Registro de campo"}
            </Text>
            <Text style={[styles.footerTime, { fontSize: 13 * s }]}>
              📷 {datetime} • NAGALLI AMBIENTAL
            </Text>
          </View>
        </View>
        <View style={styles.progress}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.progressText}>
            {failed ? "Não foi possível carregar a foto" : "Aplicando marca d'água..."}
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
  footerCaption: { color: "#fff", textAlign: "center", paddingHorizontal: 8 },
  footerTime: {
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: 8,
    marginTop: 2,
  },
  progress: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
  },
  progressText: { color: "#fff", fontSize: 14, marginLeft: 10 },
});
