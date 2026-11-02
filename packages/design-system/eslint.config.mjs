import { typescriptConfig } from "@gugu/config/eslint";
import { noLiteralUiStrings } from "@gugu/config/eslint-i18n";

export default [...typescriptConfig(import.meta.dirname), noLiteralUiStrings];
