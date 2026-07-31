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
  Image,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import {
  createTree,
  getTree,
  listTrees,
  updateTree,
  listSpeciesByPhyto,
  insertSpecies,
  deleteSpecies,
  addTreePhoto,
  deleteTreePhoto,
  listTreePhotos,
} from "../db/database";
import { colors } from "../constants/colors";
import { capToDbh, dbhToBasalArea, processTree } from "../utils/calculations";
import { phytosanitaryOptions, phytoOptions } from "../utils/formats";
import { PhotoCapture } from "../components/PhotoCapture";
import { requestLocationPermission, getCurrentCoords } from "../utils/location";
import type { Species, Stem } from "../types";
import type { RootStackParamList } from "../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "TreeForm">;

type StemInput = {
  capCm: string;
  heightComercialM: string;
  heightTotalM: string;
};

const emptyStem = (): StemInput => ({ capCm: "", heightComercialM: "", heightTotalM: "" });

const HABIT_OPTIONS = ["A - Arbórea", "Ar - Arbustiva", "Li - Liana", "Ep - Epífita", "Pt - Pteridófita", "B - Bambu"];
const DISTRIBUTION_OPTIONS = ["Comum", "Frequente", "Rara"];
const ENDEMISM_OPTIONS = ["Não", "Mata Atlântica", "Brasil"];
const CONSERVATION_OPTIONS = ["EN (IAT, 1995)", "EN (MMA, 2022)", "VU (MMA, 2022)", "CR (MMA, 2022)", "NT (MMA, 2022)", "LC (MMA, 2022)"];
const GROWTH_OPTIONS = ["Rápido", "Moderado", "Lento"];
const LIFE_SPAN_OPTIONS = ["Curta", "Média", "Longa"];
const AMPLITUDE_OPTIONS = ["Pequena", "Média", "Grande"];
const EPIPHYTES_OPTIONS = ["Nenhuma", "Poucas", "Abundante"];
const LIANAS_OPTIONS = ["Nenhuma", "Raras", "Poucas", "Abundante"];
const WOODY_LIANAS_OPTIONS = ["Ausente", "Presente"];
const GRASSES_OPTIONS = ["Nenhuma", "Raras", "Poucas", "Abundante"];
const REGENERATION_OPTIONS = ["Nenhuma", "Pouca", "Regular", "Abundante"];

export function TreeFormScreen({ route, navigation }: Props) {
  const { plotId, treeId } = route.params;
  const isEdit = !!treeId;

  const [number, setNumber] = useState("");
  // Campos usados apenas quando stems === 1 (fuste único)
  const [capCm, setCapCm] = useState("");
  const [heightComercialM, setHeightComercialM] = useState("");
  const [heightTotalM, setHeightTotalM] = useState("");

  const [speciesName, setSpeciesName] = useState("");
  const [speciesId, setSpeciesId] = useState<number | null>(null);

  const [stemCount, setStemCount] = useState("1");
  const [showCustomStemInput, setShowCustomStemInput] = useState(false);
  const [customStemText, setCustomStemText] = useState("");
  // Campos usados apenas quando stems > 1 (múltiplos fustes)
  const [stemsData, setStemsData] = useState<StemInput[]>([emptyStem()]);

  const [phytosanitary, setPhytosanitary] = useState("");
  const [notes, setNotes] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const [photos, setPhotos] = useState<{ id?: number; uri: string }[]>([]);
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);

  // Species picker
  const [showSpeciesModal, setShowSpeciesModal] = useState(false);
  const [phytoFilter, setPhytoFilter] = useState("Mata Atlântica");
  const [speciesList, setSpeciesList] = useState<Species[]>([]);

  // Nova espécie manual
  const [showNewSpeciesModal, setShowNewSpeciesModal] = useState(false);
  const [newSpecies, setNewSpecies] = useState({
    popularName: "",
    scientificName: "",
    family: "",
    woodDensity: "",
    habit: "",
    distribution: "",
    endemism: "",
    conservationStatus: "",
    growth: "",
    lifeSpan: "",
    dbhAmplitude: "",
    heightAmplitude: "",
    epiphytes: "",
    herbaceousLianas: "",
    woodyLianas: "",
    grasses: "",
    canopyRegeneration: "",
  });

  const stems = parseInt(stemCount) || 1;

  // Computed (fuste único)
  const cap = parseFloat(capCm) || 0;
  const dbh = capToDbh(cap);
  const ba = dbhToBasalArea(dbh);

  // Mantém stemsData sincronizado com a quantidade escolhida
  useEffect(() => {
    setStemsData((prev) => {
      const arr = [...prev];
      while (arr.length < stems) arr.push(emptyStem());
      while (arr.length > stems) arr.pop();
      return arr;
    });
  }, [stems]);

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
          setHeightComercialM(String(t.heightComercialM ?? ""));
          setHeightTotalM(String(t.heightTotalM ?? ""));
          setSpeciesName(t.speciesName || "");
          setSpeciesId(t.speciesId);
          setStemCount(String(t.stemCount));
          if (t.fustes && t.fustes.length > 0) {
            setStemsData(
              t.fustes.map((f) => ({
                capCm: String(f.capCm || ""),
                heightComercialM: String(f.heightComercialM || ""),
                heightTotalM: String(f.heightTotalM || ""),
              }))
            );
          }
          setPhytosanitary(t.phytosanitary || "");
          setNotes(t.notes || "");
          setPhotoUri(t.photoUri || "");
          const saved: { id?: number; uri: string }[] = (t.photos || []).map((p) => ({ id: p.id, uri: p.uri }));
          if (saved.length === 0 && t.photoUri) {
            saved.push({ uri: t.photoUri });
          }
          setPhotos(saved);
        }
      });
    }
  }, [treeId]);

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

  const handleAddSpecies = async () => {
    const scientificName = newSpecies.scientificName.trim();
    if (!scientificName) {
      Alert.alert("Nome científico obrigatório");
      return;
    }
    const woodDensity = parseFloat(newSpecies.woodDensity.replace(",", "."));
    const created: Species = {
      id: 0,
      popularName: newSpecies.popularName.trim(),
      scientificName,
      family: newSpecies.family.trim(),
      phytophysiognomy: phytoFilter,
      woodDensity: isNaN(woodDensity) ? 0 : woodDensity,
      habit: newSpecies.habit,
      distribution: newSpecies.distribution,
      endemism: newSpecies.endemism,
      conservationStatus: newSpecies.conservationStatus,
      growth: newSpecies.growth,
      lifeSpan: newSpecies.lifeSpan,
      dbhAmplitude: newSpecies.dbhAmplitude,
      heightAmplitude: newSpecies.heightAmplitude,
      epiphytes: newSpecies.epiphytes,
      herbaceousLianas: newSpecies.herbaceousLianas,
      woodyLianas: newSpecies.woodyLianas,
      grasses: newSpecies.grasses,
      canopyRegeneration: newSpecies.canopyRegeneration,
    };
    created.id = await insertSpecies(created);
    setSpeciesList((prev) =>
      [...prev, created].sort((a, b) =>
        a.scientificName.localeCompare(b.scientificName)
      )
    );
    setSpeciesName(scientificName);
    setSpeciesId(created.id);
    setNewSpecies({
      popularName: "", scientificName: "", family: "", woodDensity: "",
      habit: "", distribution: "", endemism: "", conservationStatus: "",
      growth: "", lifeSpan: "", dbhAmplitude: "", heightAmplitude: "",
      epiphytes: "", herbaceousLianas: "", woodyLianas: "", grasses: "", canopyRegeneration: "",
    });
    setShowNewSpeciesModal(false);
    setShowSpeciesModal(false);
  };

  const handleDeleteSpecies = (s: Species) => {
    Alert.alert(
      "Excluir espécie",
      `Excluir "${s.scientificName}"? As árvores já cadastradas mantêm o nome digitado.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            await deleteSpecies(s.id);
            setSpeciesList((prev) => prev.filter((x) => x.id !== s.id));
            if (speciesId === s.id) {
              setSpeciesId(null);
              setSpeciesName("");
            }
          },
        },
      ]
    );
  };

  const updateStemField = (index: number, field: keyof StemInput, value: string) => {
    setStemsData((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleStemCountPress = (n: number) => {
    setStemCount(String(n));
    setShowCustomStemInput(false);
  };

  const handleCustomStemChange = (value: string) => {
    setCustomStemText(value);
    const n = parseInt(value, 10);
    if (!isNaN(n) && n > 0) setStemCount(String(n));
  };

  const handleSave = async () => {
    if (stems === 1) {
      if (!capCm || cap <= 0) {
        Alert.alert("CAP obrigatório");
        return;
      }
    } else {
      const invalido = stemsData.some((s) => !s.capCm || parseFloat(s.capCm) <= 0);
      if (invalido) {
        Alert.alert("Preencha o CAP de todos os fustes");
        return;
      }
    }

    const syncPhotos = async (treeIdNum: number) => {
      const current = await listTreePhotos(treeIdNum);
      const kept = new Set(photos.filter((p) => p.id != null).map((p) => p.id!));
      for (const sp of current) {
        if (!kept.has(sp.id)) await deleteTreePhoto(sp.id);
      }
      for (const p of photos) {
        if (p.id == null) {
          await addTreePhoto(treeIdNum, p.uri, `Árvore #${number || "?"}`);
        }
      }
    };

    const firstPhoto = photos[0]?.uri || photoUri;

    if (stems === 1) {
      const data = {
        plotId,
        number: parseInt(number) || 1,
        speciesId,
        speciesName,
        capCm: cap,
        heightComercialM: parseFloat(heightComercialM) || 0,
        heightTotalM: parseFloat(heightTotalM) || 0,
        dbhCm: dbh,
        basalAreaM2: ba,
        stemCount: 1,
        phytosanitary,
        photoUri: firstPhoto,
        notes: notes.trim(),
        latitude,
        longitude,
      };
      if (isEdit) {
        await updateTree(treeId!, { ...data, stems: [] });
        await syncPhotos(treeId!);
      } else {
        const id = await createTree(data);
        await syncPhotos(id);
      }
    } else {
      // Múltiplos fustes: agrega área basal total e usa a maior altura total como referência da árvore.
      const parsedStems = stemsData.map((s, i) => {
        const stemCap = parseFloat(s.capCm) || 0;
        const stemDbh = capToDbh(stemCap);
        const stemBa = dbhToBasalArea(stemDbh);
        return {
          number: i + 1,
          capCm: stemCap,
          dbhCm: stemDbh,
          basalAreaM2: stemBa,
          heightComercialM: parseFloat(s.heightComercialM) || 0,
          heightTotalM: parseFloat(s.heightTotalM) || 0,
        };
      });
      const totalBa = parsedStems.reduce((sum, s) => sum + s.basalAreaM2, 0);
      const maxHeightTotal = Math.max(...parsedStems.map((s) => s.heightTotalM));
      const maxHeightComercial = Math.max(...parsedStems.map((s) => s.heightComercialM));

      const data = {
        plotId,
        number: parseInt(number) || 1,
        speciesId,
        speciesName,
        capCm: 0, // não se aplica em árvore multifuste — CAP fica por fuste
        heightComercialM: maxHeightComercial,
        heightTotalM: maxHeightTotal,
        dbhCm: 0,
        basalAreaM2: totalBa,
        stemCount: stems,
        phytosanitary,
        photoUri: firstPhoto,
        notes: notes.trim(),
        latitude,
        longitude,
      };

      if (isEdit) {
        await updateTree(treeId!, { ...data, stems: parsedStems });
        await syncPhotos(treeId!);
      } else {
        const id = await createTree({ ...data, stems: parsedStems });
        await syncPhotos(id);
      }
    }

    navigation.goBack();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Nº da árvore</Text>
      <TextInput style={styles.input} value={number} onChangeText={setNumber} keyboardType="number-pad" />

      <Text style={styles.label}>Nº de fustes</Text>
      <View style={styles.stemRow}>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.stemBtn, stems === n && !showCustomStemInput && styles.stemBtnActive]}
            onPress={() => handleStemCountPress(n)}
          >
            <Text style={[styles.stemText, stems === n && !showCustomStemInput && styles.stemTextActive]}>
              {n}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.stemBtn, showCustomStemInput && styles.stemBtnActive]}
          onPress={() => setShowCustomStemInput(true)}
        >
          <Text style={[styles.stemText, showCustomStemInput && styles.stemTextActive]}>6+</Text>
        </TouchableOpacity>
      </View>

      {showCustomStemInput && (
        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          value={customStemText}
          onChangeText={handleCustomStemChange}
          keyboardType="number-pad"
          placeholder="Quantidade de fustes"
        />
      )}

      {stems === 1 ? (
        <>
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

          <Text style={styles.label}>Altura comercial (m)</Text>
          <TextInput
            style={styles.input}
            value={heightComercialM}
            onChangeText={setHeightComercialM}
            keyboardType="decimal-pad"
            placeholder="Ex: 8,0"
          />

          <Text style={styles.label}>Altura total (m)</Text>
          <TextInput
            style={styles.input}
            value={heightTotalM}
            onChangeText={setHeightTotalM}
            keyboardType="decimal-pad"
            placeholder="Ex: 15,5"
          />
        </>
      ) : (
        stemsData.map((stem, i) => {
          const stemCap = parseFloat(stem.capCm) || 0;
          const stemDbh = capToDbh(stemCap);
          const stemBa = dbhToBasalArea(stemDbh);
          return (
            <View key={i} style={styles.stemBlock}>
              <Text style={styles.stemBlockTitle}>Fuste {i + 1}</Text>

              <Text style={styles.label}>CAP (cm) *</Text>
              <TextInput
                style={styles.input}
                value={stem.capCm}
                onChangeText={(v) => updateStemField(i, "capCm", v)}
                keyboardType="decimal-pad"
                placeholder="Ex: 45,0"
              />
              {stemCap > 0 && (
                <Text style={styles.computed}>DAP: {stemDbh.toFixed(1)} cm • Área basal: {stemBa.toFixed(4)} m²</Text>
              )}

              <Text style={styles.label}>Altura comercial (m)</Text>
              <TextInput
                style={styles.input}
                value={stem.heightComercialM}
                onChangeText={(v) => updateStemField(i, "heightComercialM", v)}
                keyboardType="decimal-pad"
              />

              <Text style={styles.label}>Altura total (m)</Text>
              <TextInput
                style={styles.input}
                value={stem.heightTotalM}
                onChangeText={(v) => updateStemField(i, "heightTotalM", v)}
                keyboardType="decimal-pad"
              />
            </View>
          );
        })
      )}

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

      <Text style={styles.label}>Fotos / Anexos</Text>
      {photos.length > 0 && (
        <View style={styles.photoGrid}>
          {photos.map((p, i) => (
            <View key={p.id ?? `new-${i}`} style={styles.photoItem}>
              <Image source={{ uri: p.uri }} style={styles.photoThumb} />
              <TouchableOpacity
                style={styles.photoRemove}
                onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Text style={styles.photoRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      <PhotoCapture
        onPhoto={(uri) => setPhotos((prev) => [...prev, { uri }])}
        caption={`Árvore #${number || "?"}`}
        buttonLabel={photos.length > 0 ? "Adicionar outra foto" : "Fotografar"}
        latitude={latitude}
        longitude={longitude}
      />
      {photos.length > 0 && (
        <Text style={styles.photoHint}>
          As fotos ficam salvas na galeria do celular e no banco do aparelho.
          Toque em ✕ para remover.
        </Text>
      )}

      {latitude !== 0 && (
        <Text style={styles.coords}>
          📍 {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </Text>
      )}

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveText}>Salvar</Text>
      </TouchableOpacity>

      <Modal visible={showSpeciesModal} animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Selecionar espécie</Text>
            <View style={styles.modalHeaderActions}>
              <TouchableOpacity onPress={() => setShowNewSpeciesModal(true)}>
                <Text style={styles.addBtn}>＋ Nova</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowSpeciesModal(false)}>
                <Text style={styles.closeBtn}>Fechar</Text>
              </TouchableOpacity>
            </View>
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
              <TouchableOpacity
                style={styles.speciesItem}
                onPress={() => handleSelectSpecies(item)}
                onLongPress={() => handleDeleteSpecies(item)}
                delayLongPress={400}
              >
                <Text style={styles.speciesItemName}>{item.scientificName}</Text>
                <Text style={styles.speciesItemPop}>
                  {item.popularName} • {item.family}
                </Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptySpecies}>Nenhuma espécie encontrada</Text>}
            ListFooterComponent={
              <Text style={styles.speciesHint}>Segure uma espécie para excluí-la</Text>
            }
          />
        </View>
      </Modal>

      <Modal visible={showNewSpeciesModal} animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nova espécie</Text>
            <TouchableOpacity onPress={() => setShowNewSpeciesModal(false)}>
              <Text style={styles.closeBtn}>Fechar</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.newSpeciesForm} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Nome científico *</Text>
            <TextInput
              style={styles.input}
              value={newSpecies.scientificName}
              onChangeText={(v) => setNewSpecies((s) => ({ ...s, scientificName: v }))}
              placeholder="Ex: Anadenanthera peregrina"
              autoCapitalize="words"
            />

            <Text style={styles.label}>Nome popular</Text>
            <TextInput
              style={styles.input}
              value={newSpecies.popularName}
              onChangeText={(v) => setNewSpecies((s) => ({ ...s, popularName: v }))}
              placeholder="Ex: Angico"
              autoCapitalize="words"
            />

            <Text style={styles.label}>Família</Text>
            <TextInput
              style={styles.input}
              value={newSpecies.family}
              onChangeText={(v) => setNewSpecies((s) => ({ ...s, family: v }))}
              placeholder="Ex: Fabaceae"
              autoCapitalize="words"
            />

            <Text style={styles.label}>Densidade da madeira (kg/m³)</Text>
            <TextInput
              style={styles.input}
              value={newSpecies.woodDensity}
              onChangeText={(v) => setNewSpecies((s) => ({ ...s, woodDensity: v }))}
              placeholder="Ex: 0,65"
              keyboardType="decimal-pad"
            />

            <Text style={styles.sectionLabel}>Fitossociologia</Text>
            <ChipSelect
              label="Hábito"
              value={newSpecies.habit}
              options={HABIT_OPTIONS}
              onChange={(v) => setNewSpecies((s) => ({ ...s, habit: v }))}
            />
            <ChipSelect
              label="Distribuição"
              value={newSpecies.distribution}
              options={DISTRIBUTION_OPTIONS}
              onChange={(v) => setNewSpecies((s) => ({ ...s, distribution: v }))}
            />
            <ChipSelect
              label="Endemismo"
              value={newSpecies.endemism}
              options={ENDEMISM_OPTIONS}
              onChange={(v) => setNewSpecies((s) => ({ ...s, endemism: v }))}
            />
            <ChipSelect
              label="Status de conservação"
              value={newSpecies.conservationStatus}
              options={CONSERVATION_OPTIONS}
              onChange={(v) => setNewSpecies((s) => ({ ...s, conservationStatus: v }))}
            />

            <Text style={styles.sectionLabel}>Ecologia (CONAMA 05/94)</Text>
            <ChipSelect
              label="Crescimento das árvores"
              value={newSpecies.growth}
              options={GROWTH_OPTIONS}
              onChange={(v) => setNewSpecies((s) => ({ ...s, growth: v }))}
            />
            <ChipSelect
              label="Vida média"
              value={newSpecies.lifeSpan}
              options={LIFE_SPAN_OPTIONS}
              onChange={(v) => setNewSpecies((s) => ({ ...s, lifeSpan: v }))}
            />
            <ChipSelect
              label="Amplitude diamétrica"
              value={newSpecies.dbhAmplitude}
              options={AMPLITUDE_OPTIONS}
              onChange={(v) => setNewSpecies((s) => ({ ...s, dbhAmplitude: v }))}
            />
            <ChipSelect
              label="Amplitude de altura"
              value={newSpecies.heightAmplitude}
              options={AMPLITUDE_OPTIONS}
              onChange={(v) => setNewSpecies((s) => ({ ...s, heightAmplitude: v }))}
            />
            <ChipSelect
              label="Epífitas"
              value={newSpecies.epiphytes}
              options={EPIPHYTES_OPTIONS}
              onChange={(v) => setNewSpecies((s) => ({ ...s, epiphytes: v }))}
            />
            <ChipSelect
              label="Lianas herbáceas"
              value={newSpecies.herbaceousLianas}
              options={LIANAS_OPTIONS}
              onChange={(v) => setNewSpecies((s) => ({ ...s, herbaceousLianas: v }))}
            />
            <ChipSelect
              label="Lianas lenhosas"
              value={newSpecies.woodyLianas}
              options={WOODY_LIANAS_OPTIONS}
              onChange={(v) => setNewSpecies((s) => ({ ...s, woodyLianas: v }))}
            />
            <ChipSelect
              label="Gramíneas"
              value={newSpecies.grasses}
              options={GRASSES_OPTIONS}
              onChange={(v) => setNewSpecies((s) => ({ ...s, grasses: v }))}
            />
            <ChipSelect
              label="Regeneração do dossel"
              value={newSpecies.canopyRegeneration}
              options={REGENERATION_OPTIONS}
              onChange={(v) => setNewSpecies((s) => ({ ...s, canopyRegeneration: v }))}
            />

            <Text style={styles.phytoHint}>
              A espécie será salva na fitofisionomia selecionada: {phytoFilter}
            </Text>

            <TouchableOpacity style={styles.saveBtn} onPress={handleAddSpecies}>
              <Text style={styles.saveText}>Salvar espécie</Text>
            </TouchableOpacity>
          </ScrollView>
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
  coords: { fontSize: 13, color: colors.textSecondary, marginTop: 8, textAlign: "center" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  photoItem: { position: "relative" },
  photoThumb: { width: 96, height: 96, borderRadius: 8 },
  photoRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  photoRemoveText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  photoHint: { fontSize: 12, color: colors.textSecondary, marginTop: 6, marginBottom: 8 },
  stemRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
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
  stemBlock: {
    marginTop: 20,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stemBlockTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
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
  modalHeaderActions: { flexDirection: "row", gap: 16, alignItems: "center" },
  addBtn: { fontSize: 16, color: colors.secondary, fontWeight: "700" },
  closeBtn: { fontSize: 16, color: colors.primary, fontWeight: "600" },
  newSpeciesForm: { flex: 1, padding: 16 },
  phytoHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 16,
    fontStyle: "italic",
  },
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
  speciesHint: { textAlign: "center", color: colors.textLight, fontSize: 12, padding: 16 },
  emptySpecies: { textAlign: "center", color: colors.textLight, marginTop: 40 },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.secondary,
    marginTop: 24,
    marginBottom: 4,
  },
});

function ChipSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.phytoFilterRow}>
        {options.map((o) => (
          <TouchableOpacity
            key={o}
            style={[styles.filterBtn, value === o && styles.filterBtnActive]}
            onPress={() => onChange(value === o ? "" : o)}
          >
            <Text style={[styles.filterText, value === o && styles.filterTextActive]}>
              {o}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}