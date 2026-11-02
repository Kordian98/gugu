import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import {
  AI_IMPORT_MAX_IMAGES,
  type AiImportConfirmInput,
  type AiImportConfirmResult,
  type AiImportExtractResult,
  type AiImportStatus,
} from "@gugu/contracts";

import { apiFetch } from "@/services/auth/api";

import { useOptionalSalon, useSalon } from "../salon-crm/data/SalonContext";

/** A picked image, downscaled on the device before upload (saves mobile data). */
export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

/** Long edge after downscaling; the server analyses at ≤ 2000 px anyway. */
const UPLOAD_EDGE = 2000;

export function useAiImportStatus() {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: ["salon", salonId, "ai-import"],
    queryFn: () => apiFetch<AiImportStatus>(`/salons/${salonId}/ai-import`),
    enabled: salonId !== "",
  });
}

export function useExtract() {
  const { salonId } = useSalon();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (images: PickedImage[]) => {
      const form = new FormData();
      for (const [i, img] of images.entries()) await appendImage(form, img, i);
      return apiFetch<AiImportExtractResult>(`/salons/${salonId}/ai-import/extract`, {
        method: "POST",
        body: form,
      });
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["salon", salonId, "ai-import"] });
    },
  });
}

export function useConfirm() {
  const { salonId } = useSalon();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AiImportConfirmInput) =>
      apiFetch<AiImportConfirmResult>(`/salons/${salonId}/ai-import/confirm`, {
        method: "POST",
        body,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["salon", salonId, "services"] }),
        qc.invalidateQueries({ queryKey: ["salon", salonId, "onboarding"] }),
        qc.invalidateQueries({ queryKey: ["salon", salonId, "summary"] }),
      ]);
    },
  });
}

/** Opens the photo library (multi-select) and returns downscaled JPEGs; [] when cancelled. */
export async function pickImages(already: number): Promise<PickedImage[]> {
  const remaining = AI_IMPORT_MAX_IMAGES - already;
  if (remaining <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 1,
    exif: false,
  });
  if (result.canceled) return [];
  const out: PickedImage[] = [];
  for (const asset of result.assets.slice(0, remaining)) out.push(await downscale(asset));
  return out;
}

async function downscale(asset: ImagePicker.ImagePickerAsset): Promise<PickedImage> {
  const long = Math.max(asset.width, asset.height);
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (long > UPLOAD_EDGE) {
    ctx.resize(asset.width >= asset.height ? { width: UPLOAD_EDGE } : { height: UPLOAD_EDGE });
  }
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

async function appendImage(form: FormData, img: PickedImage, index: number): Promise<void> {
  const name = `price-list-${String(index + 1)}.jpg`;
  if (Platform.OS === "web") {
    const blob = await (await fetch(img.uri)).blob();
    form.append("images", new Blob([blob], { type: "image/jpeg" }), name);
  } else {
    // React Native's FormData accepts a file descriptor object.
    form.append("images", { uri: img.uri, name, type: "image/jpeg" } as unknown as Blob);
  }
}
