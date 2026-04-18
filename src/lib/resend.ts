import { Resend } from "resend";
import { env } from "./env";

let cached: Resend | null = null;

export function resend() {
  if (cached) return cached;
  const key = env().RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  cached = new Resend(key);
  return cached;
}
