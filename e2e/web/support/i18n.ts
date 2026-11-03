// Reads the app's own dictionaries so tests never hardcode UI copy (vi is the source of truth).
// `t("vi", "crm:today.title", { name: "Mai" })` → the rendered string; throws on unknown keys so a
// renamed key fails loudly instead of matching nothing.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Locale = "vi" | "en";
type Dict = Record<string, unknown>;

const root = resolve(import.meta.dirname, "../../../packages/localization/locales");
const cache = new Map<string, Dict>();

function dict(locale: Locale, ns: string): Dict {
  const key = `${locale}/${ns}`;
  let d = cache.get(key);
  if (!d) {
    d = JSON.parse(readFileSync(resolve(root, locale, `${ns}.json`), "utf8")) as Dict;
    cache.set(key, d);
  }
  return d;
}

export function t(
  locale: Locale,
  nsKey: string,
  vars: Record<string, string | number> = {},
): string {
  const [ns, path] = nsKey.includes(":")
    ? (nsKey.split(":", 2) as [string, string])
    : ["common", nsKey];
  let node: unknown = dict(locale, ns);
  for (const part of path.split(".")) {
    node = typeof node === "object" && node !== null ? (node as Dict)[part] : undefined;
  }
  if (typeof node !== "string")
    throw new Error(`i18n key ${locale}:${nsKey} not found (got ${typeof node})`);
  return node.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) throw new Error(`i18n ${locale}:${nsKey} needs {{${name}}}`);
    return String(v);
  });
}

/** Exact-text regex for a translated string (escapes regex metacharacters). */
export function tx(locale: Locale, nsKey: string, vars?: Record<string, string | number>): RegExp {
  const s = t(locale, nsKey, vars).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${s}\\s*$`);
}
