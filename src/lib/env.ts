import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  // Optional — if empty, we fall back to the first number in TWILIO_VOICE_POOL_NUMBERS.
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional().default(""),
  TWILIO_VOICE_POOL_NUMBERS: z.string().min(1),
  TWILIO_WEBHOOK_SECRET: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_GATEWAY_URL: z.string().url().optional(),

  // ElevenLabs voice ID for Twilio ConversationRelay TTS. When empty, we fall
  // back to Polly.Ruth-Generative. The API key itself is configured in the
  // Twilio Console (Voice → TTS Providers → ElevenLabs), not here.
  ELEVENLABS_VOICE_ID: z.string().optional().default(""),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_GROWTH: z.string().optional(),
  STRIPE_PRICE_SCALE: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default("hello@postaud.io"),

  WEBHOOK_SIGNING_SECRET: z.string().optional(),
  JOB_RUNNER_SECRET: z.string().optional(),

  // Platform admin — comma-separated list of emails granted super-admin access.
  PLATFORM_ADMIN_EMAILS: z.string().optional().default(""),
});

type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid env:", parsed.error.flatten().fieldErrors);
    throw new Error("Missing or invalid environment variables");
  }
  cached = parsed.data;
  return cached;
}

export function voicePoolNumbers(): string[] {
  return env()
    .TWILIO_VOICE_POOL_NUMBERS.split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

export function platformAdminEmails(): string[] {
  return env()
    .PLATFORM_ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
