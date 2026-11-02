// Shared ESLint flat config for every GuGu package (docs/tasks/01-architecture.md §3.6).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export const ignores = {
  ignores: ["**/node_modules/**", "**/dist/**", "**/.expo/**", "**/.turbo/**", "**/coverage/**"],
};

/** Strict TypeScript rules shared by all packages. Requires a tsconfig in the package root. */
export function typescriptConfig(tsconfigRootDir) {
  return tseslint.config(
    ignores,
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
      languageOptions: {
        globals: { ...globals.es2024 },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/consistent-type-imports": "error",
        "no-empty": ["error", { allowEmptyCatch: false }],
        "max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
        complexity: ["warn", 15],
      },
    },
    {
      files: ["**/*.{js,cjs,mjs}"],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: { globals: { ...globals.node } },
    },
  );
}
