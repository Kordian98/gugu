import { Platform, Share } from "react-native";

/**
 * Hands text to the user without storing it anywhere: a file download on web (Blob + object URL,
 * revoked right away), the system share sheet on iOS/Android. Used for privacy exports and admin
 * recovery codes — never write these to AsyncStorage/localStorage.
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
  await Share.share({ title: fileName, message: content });
}

/** Clipboard on web; share sheet on native (no clipboard module in the app yet). */
export async function copyText(text: string): Promise<void> {
  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    await navigator.clipboard.writeText(text);
    return;
  }
  await Share.share({ message: text });
}

/** Binary file (base64) on web, e.g. an .xlsx export; native gets the share sheet with the name. */
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
  // No file system module in the app yet: native shares the CSV export instead (TODO 13).
  await Share.share({ title: fileName, message: fileName });
}
