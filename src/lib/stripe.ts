import Stripe from "stripe";
import { env } from "./env";

let cached: Stripe | null = null;

export function stripe() {
  if (cached) return cached;
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  cached = new Stripe(key);
  return cached;
}
