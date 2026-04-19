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
      <div className="mt-6 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 p-6 text-center shadow-sm">
        <p className="text-xl font-medium text-emerald-800 dark:text-emerald-400 mb-2">Check your inbox</p>
        <p className="text-[15px] font-medium text-emerald-700 dark:text-emerald-500">
          We sent a secure link to <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="block text-[15px] font-medium text-neutral-700 dark:text-neutral-300 mb-2">Email Address</label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-4 py-3.5 text-[15px] font-medium text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-600 shadow-sm"
        />
      </div>
      <button
        type="submit"
        disabled={state === "sending" || !email}
        className="mt-6 flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3.5 text-[15px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-sm"
      >
        {state === "sending" ? "Sending link…" : "Continue with Email"}
      </button>
      {errorMsg && (
        <div className="mt-2 text-[15px] font-medium text-rose-700 dark:text-rose-400 text-center">{errorMsg}</div>
      )}
    </form>
  );
}
