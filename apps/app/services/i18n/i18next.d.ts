import type { Resources } from "@gugu/localization";

// Typed translation keys (topic 03 R2): unknown keys fail at compile time.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: Resources;
  }
}
