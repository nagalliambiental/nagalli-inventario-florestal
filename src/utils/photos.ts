import * as FileSystem from "expo-file-system";

export const PHOTOS_DIR = FileSystem.documentDirectory + "photos/";

// Copia a foto para o diretório persistente do app (documentDirectory),
// pois o cache (onde câmera/view-shot/imagem escrevem) pode ser limpo
// pelo sistema operacional e fazer as fotos "desaparecerem".
export async function persistPhoto(uri: string, prefix = "foto"): Promise<string> {
  await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true }).catch(
    () => {}
  );
  const ext = uri.toLowerCase().endsWith(".png") ? ".png" : ".jpg";
  const dest = `${PHOTOS_DIR}${prefix}_${Date.now()}${ext}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

// Remove o arquivo da foto do disco, se ainda existir (fotos de árvores
// excluídas não podem continuar ocupando espaço no aparelho).
export async function deletePhotoFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {}
}
