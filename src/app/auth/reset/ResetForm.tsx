"use client";

import { useState } from "react";
import { createClient } from "@/db/client";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

export function ResetForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg(null);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? window.location.origin;
    const redirectTo = `${appUrl}/auth/callback?next=/auth/update-password`;

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

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

  if (state === "sent") {
    return (
      <div className="rounded-card border border-green bg-green-tint px-5 py-6 text-center">
        <p className="serif text-[18px] text-green-deep">Check your inbox</p>
        <p className="mt-1.5 text-[13.5px] text-muted">
          If an account exists for <strong className="text-ink">{email}</strong>, we just sent you a
          reset link.
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
          autoComplete="email"
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        disabled={state === "submitting" || !email}
        className="w-full justify-center"
      >
        {state === "submitting" ? "Sending link…" : "Send reset link"}
      </Button>

      {errorMsg && (
        <p className="mt-4 text-center text-[13px] text-amber" role="alert">
          {errorMsg}
        </p>
      )}
    </form>
  );
}
