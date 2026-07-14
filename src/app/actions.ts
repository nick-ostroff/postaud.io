"use server";

import { joinWaitlist, type WaitlistResult } from "@/server/waitlist/join";

/**
 * Thin wrapper — all logic (and every security decision) lives in
 * `joinWaitlist`, where it's unit-tested. This exists only to cross the
 * client/server boundary.
 */
export async function joinWaitlistAction(
  _prev: WaitlistResult | null,
  formData: FormData,
): Promise<WaitlistResult> {
  return joinWaitlist({
    email: formData.get("email"),
    source: formData.get("source"),
    honeypot: formData.get("website"),
  });
}
