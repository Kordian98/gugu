// Current TOTP code via the repo's own apps/api/scripts/totp-code.mjs (pure computation).
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const script = resolve(import.meta.dirname, "../../../apps/api/scripts/totp-code.mjs");

export function totpCode(secret: string): string {
  const code = execFileSync("node", [script, secret], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (!/^\d{6}$/.test(code)) throw new Error(`totp-code.mjs printed ${JSON.stringify(code)}`);
  return code;
}
