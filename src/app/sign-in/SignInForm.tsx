"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/db/client";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

type Mode = "password" | "magic";

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <form onSubmit={mode === "password" ? submitPassword : submitMagic}>
      <Field label="Email">
        <Input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </Field>

      {mode === "password" && (
        <Field label="Password">
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
      )}

      <Button type="submit" variant="primary" disabled={disabled} className="w-full justify-center">
        {state === "submitting"
          ? mode === "password" ? "Signing in…" : "Sending link…"
          : mode === "password" ? "Sign in" : "Email me a sign-in link"}
      </Button>

      {/* The `or` divider — the ::before/::after rule pattern from the mockup. */}
      <div className="my-5 flex items-center gap-3 text-[11.5px] font-semibold tracking-[0.1em] text-faint uppercase before:h-px before:flex-1 before:bg-line before:content-[''] after:h-px after:flex-1 after:bg-line after:content-['']">
        or
      </div>

      {/* This slot is where "Continue with Google" goes when OAuth is enabled. */}
      <Button
        type="button"
        variant="secondary"
        className="w-full justify-center"
        onClick={() => {
          setMode(mode === "password" ? "magic" : "password");
          setState("idle");
          setErrorMsg(null);
        }}
      >
        {mode === "password" ? "Email me a link instead" : "Use a password instead"}
      </Button>

      {errorMsg && (
        <p className="mt-4 text-center text-[13px] text-amber" role="alert">
          {errorMsg}
        </p>
      )}

      <div className="mt-5 text-center text-[12.5px]">
        <Link href="/auth/reset" className="text-muted hover:text-ink">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}
