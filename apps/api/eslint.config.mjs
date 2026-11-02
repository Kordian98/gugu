import { typescriptConfig } from "@gugu/config/eslint";

export default [
  { ignores: ["src/infrastructure/prisma/generated/**", "prisma/spike/generated/**"] },
  ...typescriptConfig(import.meta.dirname),
  {
    // Nest resolves constructor injection from emitted decorator metadata, so injected classes must
    // stay value imports; this makes consistent-type-imports aware of that.
    languageOptions: {
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
    rules: {
      // Nest modules/controllers are decorated empty classes by design.
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
    },
  },
];
