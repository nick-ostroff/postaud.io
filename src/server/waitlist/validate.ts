import { z } from "zod";

const emailSchema = z.string().email();

/**
 * Trimmed + lowercased email, or null if the input isn't a usable address.
 *
 * Normalization happens before validation, not as a Zod transform chain — so
 * the order is explicit and doesn't depend on how Zod sequences `.trim()`,
 * `.toLowerCase()`, and `.email()`.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toLowerCase();
  const parsed = emailSchema.safeParse(cleaned);
  return parsed.success ? parsed.data : null;
}
