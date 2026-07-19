/**
 * Content hashing for incremental vault sync.
 *
 * The plugin stores one hash per note and rewrites only what moved, so these
 * hashes must be stable across requests for unchanged content — hence the
 * key-sorted serialization. Array order IS preserved, because fact ordering is
 * meaningful and a reorder should rewrite the note.
 *
 * 16 hex chars (64 bits) is ample: this is change detection, not a security
 * boundary.
 */
import { createHash } from "node:crypto";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}
