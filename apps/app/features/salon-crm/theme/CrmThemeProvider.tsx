import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Platform, useColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar";

import { CalmThemeProvider, type CalmScheme } from "@gugu/design-system";

import { useViewport } from "@/services/viewport/useViewport";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "gugu.crm.theme";

/** Per-device convenience until the preference is stored on the account (topic 05). */
function readPreference(): ThemePreference {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "light" || v === "dark" || v === "system") return v;
    }
  } catch {
    // Storage blocked (private mode): fall back to the system theme.
  }
  return "system";
}

function writePreference(p: ThemePreference) {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined")
      localStorage.setItem(STORAGE_KEY, p);
  } catch {
    // Not persisted; the choice still applies for this session.
  }
}

/**
 * OS theme. On web we read `prefers-color-scheme` directly: the NativeWind/react-native-css layer wraps
 * `useColorScheme` and reports its own (light) scheme, which is not the visitor's OS setting.
 */
function useSystemScheme(): CalmScheme {
  const native = useColorScheme();
  const web = useSyncExternalStore(subscribeDarkQuery, readDarkQuery, () => "light" as const);
  if (Platform.OS === "web") return web;
  return native === "dark" ? "dark" : "light";
}

const darkQuery = () =>
  typeof window !== "undefined" && "matchMedia" in window
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function subscribeDarkQuery(onChange: () => void): () => void {
  const q = darkQuery();
  q?.addEventListener("change", onChange);
  return () => q?.removeEventListener("change", onChange);
}

function readDarkQuery(): CalmScheme {
  return darkQuery()?.matches === true ? "dark" : "light";
}

const PreferenceContext = createContext<{
  preference: ThemePreference;
  scheme: CalmScheme;
  setPreference: (p: ThemePreference) => void;
}>({ preference: "system", scheme: "light", setPreference: () => undefined });

/**
 * Light + dark for the salon workspace only (X18): follows the OS by default, user override persists.
 * Public and customer surfaces stay light — this provider is mounted only inside (business).
 */
export function CrmThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemScheme();
  const [preference, setPref] = useState<ThemePreference>(readPreference);
  // The server cannot know the OS theme or the saved choice: hydrate as light, then switch.
  const { mounted } = useViewport();
  const resolved: CalmScheme = preference === "system" ? system : preference;
  const scheme: CalmScheme = mounted ? resolved : "light";

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const prev = root.style.colorScheme;
    root.style.colorScheme = scheme;
    return () => {
      root.style.colorScheme = prev;
    };
  }, [scheme]);

  const setPreference = (p: ThemePreference) => {
    setPref(p);
    writePreference(p);
  };

  return (
    <PreferenceContext.Provider value={{ preference, scheme, setPreference }}>
      <CalmThemeProvider scheme={scheme}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        {children}
      </CalmThemeProvider>
    </PreferenceContext.Provider>
  );
}

export function useThemePreference() {
  return useContext(PreferenceContext);
}
