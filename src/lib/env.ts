import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),

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
