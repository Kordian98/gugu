import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";
import { typescriptConfig } from "@gugu/config/eslint";
import { noLiteralUiStrings } from "@gugu/config/eslint-i18n";

export default defineConfig([
  ...expoConfig,
  ...typescriptConfig(import.meta.dirname),
  noLiteralUiStrings,
  { ignores: ["dist-web/**", "ios/**", "android/**", "*.config.js", "nativewind-env.d.ts"] },
]);
