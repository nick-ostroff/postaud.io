import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Optional at the schema level ON PURPOSE: this backs only the vault-sync
  // API-token path (src/db/user-client.ts), not sign-in. `env()` runs on
  // every authenticated page render via isPlatformAdmin() -> platformAdminEmails(),
  // so a required-but-unset vault secret would 500 the entire /app/* tree for
  // every user, not just vault-sync callers. Missing-secret failures for the
  // vault path itself happen loudly at the point of use instead — see
  // `userScopedClient` in src/db/user-client.ts.
  //
  // Preprocessed so a BLANK value (`SUPABASE_JWT_SECRET=` in .env.local,
  // which dotenv sets as `""`, not `undefined`) is treated the same as
  // unset — without this, `.min(1).optional()` alone still rejects the
  // present-but-empty string and the whole parse fails exactly as before.
  SUPABASE_JWT_SECRET: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default("hello@postaud.io"),

  CRON_SECRET: z.string().optional(),

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

export function platformAdminEmails(): string[] {
  return env()
    .PLATFORM_ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
