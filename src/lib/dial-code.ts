import { randomInt } from "node:crypto";

/** Returns a 6-digit numeric code as a string. Leading zeros preserved. */
export function generateDialCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Builds the tel: URI that auto-dials the DTMF code after 2 short pauses. */
export function buildTelUri(pooledNumber: string, dialCode: string): string {
  return `tel:${pooledNumber},,${dialCode}`;
}
