import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  FlatList,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { createTree, getTree, listTrees, updateTree, listSpeciesByPhyto } from "../db/database";
import { colors } from "../constants/colors";
import { capToDbh, dbhToBasalArea, processTree } from "../utils/calculations";
import { phytosanitaryOptions, phytoOptions } from "../utils/formats";
import { PhotoCapture } from "../components/PhotoCapture";
import { requestLocationPermission, getCurrentCoords } from "../utils/location";
import type { Species, Stem } from "../types";
import type { RootStackParamList } from "../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "TreeForm">;

export function TreeFormScreen({ route, navigation }: Props) {
  const { plotId, treeId } = route.params;
  const isEdit = !!treeId;

  const [number, setNumber] = useState("");
  const [capCm, setCapCm] = useState("");
  const [heightM, setHeightM] = useState("");
  const [speciesName, setSpeciesName] = useState("");
  const [speciesId, setSpeciesId] = useState<number | null>(null);
  const [stemCount, setStemCount] = useState("1");
  const [phytosanitary, setPhytosanitary] = useState("");
  const [notes, setNotes] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);

  // Species picker
  const [showSpeciesModal, setShowSpeciesModal] = useState(false);
  const [phytoFilter, setPhytoFilter] = useState("Mata Atlântica");
  const [speciesList, setSpeciesList] = useState<Species[]>([]);

  // Computed
  const cap = parseFloat(capCm) || 0;
  const dbh = capToDbh(cap);
  const ba = dbhToBasalArea(dbh);
  const stems = parseInt(stemCount) || 1;

  useFocusEffect(
    useCallback(() => {
      loadSpecies();
    }, [phytoFilter])
  );

  const loadSpecies = async () => {
    const list = await listSpeciesByPhyto(phytoFilter);
    setSpeciesList(list);
  };

  useEffect(() => {
    if (treeId) {
      getTree(treeId).then((t) => {
        if (t) {
          setNumber(String(t.number));
          setCapCm(String(t.capCm));
          setHeightM(String(t.heightM));
          setSpeciesName(t.speciesName || "");
          setSpeciesId(t.speciesId);
          setStemCount(String(t.stemCount));
          setPhytosanitary(t.phytosanitary || "");
          setNotes(t.notes || "");
        }
      });
    }
  }, [treeId]);

  // Request GPS on mount
  useEffect(() => {
    (async () => {
      const granted = await requestLocationPermission();
      if (granted) {
        const coords = await getCurrentCoords();
        if (coords) {
          setLatitude(coords.latitude);
          setLongitude(coords.longitude);
        }
      }
    })();
  }, []);

  // Auto-increment number for new trees
  useFocusEffect(
    useCallback(() => {
      if (!isEdit) {
        listTrees(plotId).then((trees) => {
            const max = Math.max(0, ...trees.map((t) => t.number));
            setNumber(String(max + 1));
        });
      }
    }, [plotId])
  );

  const handleSelectSpecies = (s: Species) => {
    setSpeciesName(s.scientificName);
    setSpeciesId(s.id);
    setShowSpeciesModal(false);
  };

  const handleSave = async () => {
    if (!capCm || cap <= 0) {
      Alert.alert("CAP obrigatório");
      return;
    }
    const data = {
      plotId,
      number: parseInt(number) || 1,
      speciesId,
      speciesName,
      capCm: cap,
      heightM: parseFloat(heightM) || 0,
      dbhCm: dbh,
      basalAreaM2: stems > 1 ? ba * stems : ba,
      stemCount: stems,
      phytosanitary,
      photoUri,
      notes: notes.trim(),
      latitude,
      longitude,
    };
    if (isEdit) {
      await updateTree(treeId!, data);
    } else {
      await createTree(data);
    }
    navigation.goBack();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Nº da árvore</Text>
      <TextInput style={styles.input} value={number} onChangeText={setNumber} keyboardType="number-pad" />

      <Text style={styles.label}>CAP (cm) *</Text>
      <TextInput
        style={styles.input}
        value={capCm}
        onChangeText={setCapCm}
        keyboardType="decimal-pad"
        placeholder="Ex: 78,5"
      />
      {cap > 0 && (
        <Text style={styles.computed}>DAP: {dbh.toFixed(1)} cm • Área basal: {ba.toFixed(4)} m²</Text>
      )}

      <Text style={styles.label}>Altura (m)</Text>
      <TextInput
        style={styles.input}
        value={heightM}
        onChangeText={setHeightM}
        keyboardType="decimal-pad"
        placeholder="Ex: 15,5"
      />

      <Text style={styles.label}>Nº de fustes</Text>
      <View style={styles.stemRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.stemBtn, stems === n && styles.stemBtnActive]}
            onPress={() => setStemCount(String(n))}
          >
            <Text style={[styles.stemText, stems === n && styles.stemTextActive]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Espécie</Text>
      <TouchableOpacity style={styles.speciesBtn} onPress={() => setShowSpeciesModal(true)}>
        <Text style={speciesName ? styles.speciesText : styles.placeholder}>
          {speciesName || "Selecionar espécie..."}
        </Text>
      </TouchableOpacity>

      <Text style={styles.label}>Condição fitossanitária</Text>
      <View style={styles.phytoRow}>
        {phytosanitaryOptions.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.phytoBtn, phytosanitary === opt && styles.phytoBtnActive]}
            onPress={() => setPhytosanitary(opt)}
          >
            <Text style={[styles.phytoText, phytosanitary === opt && styles.phytoTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Observações</Text>
      <TextInput style={styles.input} value={notes} onChangeText={setNotes} multiline numberOfLines={3} />

      <Text style={styles.label}>Foto</Text>
      <PhotoCapture onPhoto={setPhotoUri} currentUri={photoUri} />

      {latitude !== 0 && (
        <Text style={styles.coords}>
          📍 {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </Text>
      )}

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveText}>Salvar</Text>
      </TouchableOpacity>

      {/* Species Modal */}
      <Modal visible={showSpeciesModal} animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Selecionar espécie</Text>
            <TouchableOpacity onPress={() => setShowSpeciesModal(false)}>
              <Text style={styles.closeBtn}>Fechar</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.phytoFilterRow}>
            {phytoOptions.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.filterBtn, phytoFilter === p && styles.filterBtnActive]}
                onPress={() => setPhytoFilter(p)}
              >
                <Text style={[styles.filterText, phytoFilter === p && styles.filterTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <FlatList
            data={speciesList}
            keyExtractor={(i) => String(i.id)}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.speciesItem} onPress={() => handleSelectSpecies(item)}>
                <Text style={styles.speciesItemName}>{item.scientificName}</Text>
                <Text style={styles.speciesItemPop}>
                  {item.popularName} • {item.family}
                </Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptySpecies}>Nenhuma espécie encontrada</Text>}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: 16, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  computed: { fontSize: 13, color: colors.primary, marginTop: 4, fontWeight: "500" },
  stemRow: { flexDirection: "row", gap: 8 },
  stemBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  stemBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stemText: { fontSize: 16, fontWeight: "600", color: colors.text },
  stemTextActive: { color: colors.white },
  speciesBtn: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speciesText: { fontSize: 16, color: colors.text, fontStyle: "italic" },
  placeholder: { fontSize: 16, color: colors.textLight },
  phytoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  phytoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  phytoBtnActive: { backgroundColor: colors.warning, borderColor: colors.warning },
  phytoText: { fontSize: 13, color: colors.textSecondary },
  phytoTextActive: { color: colors.white, fontWeight: "600" },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 32,
  },
  saveText: { color: colors.white, fontSize: 17, fontWeight: "700" },
  // Modal
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  closeBtn: { fontSize: 16, color: colors.primary, fontWeight: "600" },
  phytoFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 12 },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, color: colors.textSecondary },
  filterTextActive: { color: colors.white, fontWeight: "600" },
  speciesItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  speciesItemName: { fontSize: 16, color: colors.text, fontStyle: "italic" },
  speciesItemPop: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  emptySpecies: { textAlign: "center", color: colors.textLight, marginTop: 40 },
});
