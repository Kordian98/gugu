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
