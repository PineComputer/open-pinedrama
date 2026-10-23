// Seals what the studio keeps about its Computers (credentials, bindings, session tokens)
// with AES-256-GCM. The key is generated on first run, so the maker manages no second
// secret; the desktop app passes one from the OS keychain as STUDIO_SECRET instead.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config.ts";

let cached: Buffer | undefined;

function key(): Buffer {
  if (cached) return cached;
  if (process.env.STUDIO_SECRET) {
    cached = Buffer.from(process.env.STUDIO_SECRET, "base64");
  } else {
    const file = path.join(DATA_DIR, "secret.key");
    if (!existsSync(file)) {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600 });
    }
    cached = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
  }
  if (cached.length !== 32) throw new Error("The sealing key must be 32 bytes, base64.");
  return cached;
}

export function seal(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function unseal(sealed: string): string {
  if (!sealed.startsWith("v1:")) throw new Error("Unknown sealed format.");
  const raw = Buffer.from(sealed.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
