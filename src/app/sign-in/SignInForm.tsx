"use client";

import { useState } from "react";
import { createClient } from "@/db/client";

export function SignInForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setErrorMsg(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;

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
  }

  if (state === "sent") {
    return (
      <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm">
        <p className="font-medium text-emerald-800">Check your inbox</p>
        <p className="mt-1 text-emerald-700">
          We sent a sign-in link to <strong>{email}</strong>. Click it to continue.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <label className="block text-xs font-medium text-neutral-600">Email</label>
      <input
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      />
      <button
        type="submit"
        disabled={state === "sending" || !email}
        className="mt-2 flex w-full items-center justify-center rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
      >
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {errorMsg && (
        <div className="mt-2 text-xs text-rose-700">{errorMsg}</div>
      )}
    </form>
  );
}
