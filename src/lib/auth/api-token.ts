/**
 * Personal access tokens for the Obsidian plugin (and any future API client).
 *
 * Only the SHA-256 hash is ever persisted — the raw token is shown to the user
 * exactly once at creation. A stolen database therefore yields no usable
 * tokens. No salt/bcrypt here on purpose: these are 256 bits of CSPRNG output,
 * not user-chosen passwords, so there is nothing to brute-force or rainbow.
 */
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_PREFIX = "pat_";

/** 32 random bytes → 43 base64url chars. */
export function generateApiToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cheap shape check so malformed Authorization headers skip the DB lookup. */
export function looksLikeApiToken(value: string): boolean {
  return value.startsWith(TOKEN_PREFIX) && value.length >= TOKEN_PREFIX.length + 40;
}
