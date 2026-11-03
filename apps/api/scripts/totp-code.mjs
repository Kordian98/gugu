#!/usr/bin/env node
// Prints the current TOTP code for a base32 secret (local dev / agents without a phone; topic 05
// step 9). Usage: node scripts/totp-code.mjs <base32-secret> [--next]
// Pure computation: no database, no network. Never use it with a production admin's secret.
import { createHmac } from "node:crypto";

const secret = process.argv[2];
if (!secret) throw new Error("usage: node scripts/totp-code.mjs <base32-secret> [--next]");
const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
let bits = 0;
let value = 0;
const bytes = [];
for (const ch of secret.replace(/[\s=-]/g, "").toUpperCase()) {
  const i = A.indexOf(ch);
  if (i < 0) throw new Error("invalid base32 secret");
  value = (value << 5) | i;
  bits += 5;
  if (bits >= 8) {
    bytes.push((value >>> (bits - 8)) & 255);
    bits -= 8;
  }
}
const step = Math.floor(Date.now() / 30_000) + (process.argv.includes("--next") ? 1 : 0);
const msg = Buffer.alloc(8);
msg.writeBigUInt64BE(BigInt(step));
const mac = createHmac("sha1", Buffer.from(bytes)).update(msg).digest();
const offset = mac[mac.length - 1] & 0x0f;
const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
console.log(String(code).padStart(6, "0"));
console.error(
  `(valid ~${String(30 - (Math.floor(Date.now() / 1000) % 30))} s more; each code works once)`,
);
