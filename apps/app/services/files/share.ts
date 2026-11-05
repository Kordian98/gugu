import { Platform, Share } from "react-native";

/**
 * Downloads a file on web and shares a real cache-file attachment on iOS/Android.
 * Export content never enters AsyncStorage/localStorage or leaves the device until the user
 * chooses a destination in the system share sheet.
 */
export async function saveTextFile(fileName: string, mimeType: string, content: string) {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  await shareNativeFile(fileName, mimeType, content, "utf8");
}

/** Clipboard on web; share sheet on native (no clipboard module in the app yet). */
export async function copyText(text: string): Promise<void> {
  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    await navigator.clipboard.writeText(text);
    return;
  }
  await Share.share({ message: text });
}

/** Binary export, e.g. XLSX: decode to bytes on web, or write base64 to a native file. */
export async function saveBase64File(fileName: string, mimeType: string, base64: string) {
  if (Platform.OS === "web") {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  await shareNativeFile(fileName, mimeType, base64, "base64");
}

const EXPORT_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
let sequence = 0;
let nativeShareOpen = false;

/** Keep a successful attachment available while Android's receiving app consumes its URI.
 * Expired exports are removed on the next export; the OS can evict this private cache sooner.
 * Failed writes/shares are removed immediately. Nothing is saved to the public Documents folder.
 */
async function shareNativeFile(
  fileName: string,
  mimeType: string,
  content: string,
  encoding: "utf8" | "base64",
): Promise<void> {
  if (nativeShareOpen) throw new Error("files.share_in_progress");
  nativeShareOpen = true;
  try {
    // Native dependencies stay out of the server-rendered/web execution path.
    const [{ Directory, File, Paths }, sharing] = await Promise.all([
      import("expo-file-system"),
      import("expo-sharing"),
    ]);
    if (!(await sharing.isAvailableAsync())) throw new Error("files.sharing_unavailable");
    const cache = new Directory(Paths.cache, "gugu-exports");
    cache.create({ idempotent: true });
    const now = Date.now();
    for (const old of cache.list()) {
      const created = Number(old.name.split("-")[0]);
      if (Number.isFinite(created) && created > 0 && created < now - EXPORT_CACHE_MAX_AGE) {
        old.delete();
      }
    }
    const folder = new Directory(cache, `${String(now)}-${String(++sequence)}`);
    folder.create();
    // The API controls export names, but never let a malformed name leave this cache directory.
    const name =
      fileName
        .split(/[\\/]/)
        .pop()
        ?.split("")
        .filter((char) => char.charCodeAt(0) >= 32)
        .join("") || "export";
    const file = new File(folder, name === "." || name === ".." ? "export" : name);
    try {
      file.create();
      await file.write(content, { encoding });
      await sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
    } catch (error) {
      if (folder.exists) folder.delete();
      throw error;
    }
  } finally {
    nativeShareOpen = false;
  }
}
