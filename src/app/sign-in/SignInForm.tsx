"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/db/client";
import { Button } from "@/components/ui/Button";

type Mode = "password" | "magic";

/** The taller, softer input from the mobile mockups (12px radius, 15px text). */
const authInput =
  "w-full rounded-xl border border-line-strong bg-card px-4 py-3.5 text-[15px] text-ink placeholder:text-faint focus:border-green focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-green";

const authLabel = "text-[11.5px] font-semibold uppercase tracking-[0.07em] text-muted";

/**
 * Sign in (mobile mockup 6a) — email + password, with the password's
 * "Forgot?" and "Show" affordances inline in the field rather than stranded
 * under the form, so the whole thing fits one thumb-reach on a phone.
 *
 * The secondary pill is a magic link, not "Continue with Google": Google
 * OAuth isn't enabled on the Supabase project yet, and a button that 400s is
 * worse than one that works. Swap the handler for
 * `supabase.auth.signInWithOAuth({ provider: "google" })` once the provider
 * is configured — `/auth/callback` already handles the OAuth redirect.
 */
export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setState("error");
        setErrorMsg(error.message);
        return;
      }
      router.push(next ?? "/app");
      router.refresh();
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function submitMagic(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg(null);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? window.location.origin;
    const redirectTo = `${appUrl}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        setState("error");
        setErrorMsg(error.message);
        return;
      }
      setState("sent");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (mode === "magic" && state === "sent") {
    return (
      <div className="rounded-card border border-green bg-green-tint px-5 py-6 text-center">
        <p className="serif text-[18px] text-green-deep">Check your inbox</p>
        <p className="mt-1.5 text-[13.5px] text-muted">
          We sent a secure link to <strong className="text-ink">{email}</strong>.
        </p>
      </div>
    );
  }

  const disabled = state === "submitting" || !email || (mode === "password" && !password);

  return (
    <form onSubmit={mode === "password" ? submitPassword : submitMagic} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={authLabel}>
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className={authInput}
        />
      </div>

      {mode === "password" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline">
            <label htmlFor="password" className={authLabel}>
              Password
            </label>
            <Link href="/auth/reset" className="ml-auto text-xs text-green-deep">
              Forgot?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={`${authInput} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-muted hover:text-ink"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
      )}

      <Button
        type="submit"
        variant="ink"
        size="big"
        disabled={disabled}
        className="mt-1 w-full justify-center"
      >
        {state === "submitting"
          ? mode === "password"
            ? "Signing in…"
            : "Sending link…"
          : mode === "password"
            ? "Sign in"
            : "Email me a sign-in link"}
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted before:h-px before:flex-1 before:bg-line before:content-[''] after:h-px after:flex-1 after:bg-line after:content-['']">
        or
      </div>

      <Button
        type="button"
        variant="secondary"
        size="big"
        className="w-full justify-center font-medium"
        onClick={() => {
          setMode(mode === "password" ? "magic" : "password");
          setState("idle");
          setErrorMsg(null);
        }}
      >
        {mode === "password" ? "Email me a link instead" : "Use a password instead"}
      </Button>

      {errorMsg && (
        <p className="text-center text-[13px] text-amber" role="alert">
          {errorMsg}
        </p>
      )}
    </form>
  );
}
