import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { captureRef } from "react-native-view-shot";
import { formatUtm } from "../utils/utm";
import { fmtDateTime } from "../utils/formats";

const LOGO = require("../../assets/icon.png");

function formatLatLon(lat?: number, lon?: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !lat || !lon) return "";
  return `${lat!.toFixed(6)}, ${lon!.toFixed(6)}`;
}

interface Props {
  uri: string;
  width: number;
  height: number;
  caption?: string;
  latitude?: number;
  longitude?: number;
  onDone: (uri: string | null) => void;
  onCancel: () => void;
}

const WATCHDOG_MS = 4000;
const MAX_OUTPUT_DIM = 2560;

// Marca d'água renderizada INLINE no fluxo da tela (sem Modal e sem overlay
// em outra janela): no Android, view dentro de Modal fica em outra janela
// nativa e o view-shot falha/preto — era o "trava e salva foto normal".
// Aqui a composição aparece no próprio formulário, o capture funciona e há
// botão para usar a foto original caso algo falhe.
export function PhotoWatermark({
  uri,
  width,
  height,
  caption,
  latitude,
  longitude,
  onDone,
  onCancel,
}: Props) {
  const ref = useRef<View>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const { width: winW } = useWindowDimensions();

  // Prévia limitada à largura da tela (captura rápida e sem estouro).
  const displayW = Math.min(winW - 32, 900);
  const ratio = width > 0 && height > 0 ? height / width : 3 / 4;
  const displayH = Math.round(displayW * ratio);
  const s = Math.max(0.6, Math.min(1.2, displayW / 900));

  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // Watchdog: se a imagem não carregar em 4s, desiste rápido (sem travar).
  useEffect(() => {
    const t = setTimeout(() => {
      if (!loaded) setFailed(true);
    }, WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loaded && !failed) return;
    let cancelled = false;
    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      if (!cancelled) doneRef.current(result);
    };
    if (failed || !ref.current) {
      const t = setTimeout(() => finish(null), 250);
      return () => { cancelled = true; clearTimeout(t); };
    }
    let timeout: any;
    const run = async () => {
      try {
        await new Promise((r) => setTimeout(r, 200));
        if (cancelled) return;
        const scale = Math.min(1, MAX_OUTPUT_DIM / Math.max(width, height));
        const result = await captureRef(ref, {
          format: "jpg",
          quality: 0.95,
          result: "tmpfile",
          width: Math.round(width * scale),
          height: Math.round(height * scale),
        });
        finish(result);
      } catch {
        finish(null);
      }
    };
    timeout = setTimeout(() => finish(null), 8000);
    run();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [loaded, failed]);

  const datetime = fmtDateTime(Date.now());
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude || 0) !== 0;
  const utm = hasCoords ? formatUtm(latitude!, longitude!) : "";
  const latlon = hasCoords ? formatLatLon(latitude, longitude) : "";

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Prévia com marca d'água Nagalli</Text>
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
        <View style={[styles.badge, { top: 10 * s, left: 10 * s }]}>
          <Image
            source={LOGO}
            style={{ width: 40 * s, height: 40 * s, borderRadius: 8 * s }}
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
          {latlon ? (
            <Text style={[styles.footerCoords, { fontSize: 10 * s }]}>
              {latlon}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.statusRow}>
        {!failed ? (
          <>
            <ActivityIndicator size="small" color="#0a2a5e" />
            <Text style={styles.statusText}>Aplicando marca d'água...</Text>
          </>
        ) : (
          <Text style={styles.statusText}>Sem marca d'água — usando foto original.</Text>
        )}
        <TouchableOpacity onPress={onCancel} hitSlop={10} style={styles.skipBtn}>
          <Text style={styles.skipText}>Usar original</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 10, backgroundColor: "#eef1f6", borderRadius: 12, padding: 10 },
  title: { fontWeight: "800", color: "#0a2a5e", fontSize: 14, marginBottom: 8 },
  capture: { backgroundColor: "#000", borderRadius: 8, overflow: "hidden", alignSelf: "center" },
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
    color: "#fff", fontWeight: "700", textAlign: "center",
    paddingHorizontal: 8, marginTop: 2,
  },
  footerCoords: {
    color: "#dcdcdc", textAlign: "center", paddingHorizontal: 8, marginTop: 1,
  },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 },
  statusText: { color: "#5a6b87", fontSize: 13, flex: 1 },
  skipBtn: { paddingVertical: 8, paddingHorizontal: 10, minHeight: 40, justifyContent: "center" },
  skipText: { color: "#0a2a5e", fontWeight: "700", fontSize: 13 },
});
