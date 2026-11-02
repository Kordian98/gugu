import { Platform } from "react-native";

/**
 * API origin. Set EXPO_PUBLIC_API_URL for devices/other hosts. Defaults: localhost:3002 (web, iOS
 * simulator); 10.0.2.2 is the Android emulator's alias for the host machine.
 */
export const API_URL: string =
  process.env["EXPO_PUBLIC_API_URL"] ??
  (Platform.OS === "android" ? "http://10.0.2.2:3002" : "http://localhost:3002");

/** Web uses the httpOnly session cookie; native uses bearer tokens in SecureStore (spec 05 R9–R11). */
export const AUTH_CLIENT: "web" | "native" = Platform.OS === "web" ? "web" : "native";
