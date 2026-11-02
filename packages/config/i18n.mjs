// Bans literal UI strings in JSX (master prompt §5, §29). Brand name is the only allowed literal.
import i18next from "eslint-plugin-i18next";

export const noLiteralUiStrings = {
  files: ["**/*.tsx"],
  plugins: { i18next },
  rules: {
    "i18next/no-literal-string": [
      "error",
      {
        mode: "jsx-only",
        // Only user-facing attributes are checked; testID/className/etc. are identifiers.
        "jsx-attributes": {
          include: [
            "accessibilityLabel",
            "accessibilityHint",
            "aria-label",
            "placeholder",
            "title",
            "alt",
          ],
        },
        words: { exclude: ["GuGu", "[0-9!-/:-@[-`{-~]+"] },
      },
    ],
  },
};
