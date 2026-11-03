import { typescriptConfig } from "@gugu/config/eslint";

export default [
  ...typescriptConfig(import.meta.dirname),
  { ignores: [".e2e/**", "playwright-report/**", "test-results/**"] },
];
