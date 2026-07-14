"use client";

import { useState } from "react";
import { createClient } from "@/db/client";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

export function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg(null);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? window.location.origin;
    const redirectTo = `${appUrl}/auth/callback?next=/auth/verify`;

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        setState("error");
        setErrorMsg(error.message);
        return;
      }

      // Supabase returns an empty identities array when the email is already
      // registered and confirmed (anti-enumeration). We surface this explicitly
      // rather than sending the user to a "check your inbox" dead end.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setState("error");
        setErrorMsg("An account with this email already exists. Try signing in instead.");
        return;
      }

      setState("sent");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-card border border-green bg-green-tint px-5 py-6 text-center">
        <p className="serif text-[18px] text-green-deep">Check your inbox</p>
        <p className="mt-1.5 text-[13.5px] text-muted">
          We sent a confirmation link to <strong className="text-ink">{email}</strong>. Click it to
          finish creating your account.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Email">
        <Input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
        />
      </Field>

      <Field label="Password" hint="At least 8 characters.">
        <Input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        disabled={state === "submitting" || !email || password.length < 8}
        className="w-full justify-center"
      >
        {state === "submitting" ? "Creating account…" : "Create account"}
      </Button>

      {errorMsg && (
        <p className="mt-4 text-center text-[13px] text-amber" role="alert">
          {errorMsg}
        </p>
      )}
    </form>
  );
}
