import { serviceClient } from "@/db/service";
import { normalizeEmail } from "./validate";

export type WaitlistSource = "hero" | "footer";
export type WaitlistResult = { ok: true } | { ok: false; error: string };

const SOURCES: WaitlistSource[] = ["hero", "footer"];

/** Postgres unique_violation — the email is already on the list. */
const UNIQUE_VIOLATION = "23505";

/**
 * Adds an email to the waitlist.
 *
 * Two things here are deliberate and must not be "fixed":
 *
 * 1. A duplicate email returns the SAME `{ ok: true }` as a fresh signup. If it
 *    didn't, anyone could submit an address and learn from the response whether
 *    it was already on the list — an email-enumeration oracle on a public form.
 *
 * 2. A filled honeypot also returns `{ ok: true }` without writing. Bots get
 *    told they succeeded; telling them they failed just teaches them to retry.
 *
 * Writes go through the service client because `waitlist` has RLS on with no
 * policies (see 0010_waitlist.sql) — the public has no direct write path.
 */
export async function joinWaitlist(input: {
  email: unknown;
  source: unknown;
  honeypot: unknown;
}): Promise<WaitlistResult> {
  if (typeof input.honeypot === "string" && input.honeypot.trim() !== "") {
    return { ok: true };
  }

  const email = normalizeEmail(input.email);
  if (!email) {
    return { ok: false, error: "That doesn't look like an email address." };
  }

  const source = SOURCES.includes(input.source as WaitlistSource)
    ? (input.source as WaitlistSource)
    : null;

  const { error } = await serviceClient().from("waitlist").insert({ email, source });

  if (error && error.code !== UNIQUE_VIOLATION) {
    console.error("[waitlist] insert failed", error);
    return { ok: false, error: "Something went wrong. Try again in a moment." };
  }

  return { ok: true };
}
