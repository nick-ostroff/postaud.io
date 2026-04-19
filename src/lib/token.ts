import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // Crockford-ish: skip confusing chars

/** 16-char URL-safe token for recipient landing pages. */
export function generateToken(len = 16): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
