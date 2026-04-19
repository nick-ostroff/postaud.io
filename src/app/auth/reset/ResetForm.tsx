"use client";

import { useState } from "react";
import { createClient } from "@/db/client";

export function ResetForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg(null);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? window.location.origin;
    const redirectTo = `${appUrl}/auth/update-password`;

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
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 p-6 text-center shadow-sm">
        <p className="text-xl font-medium text-emerald-800 dark:text-emerald-400 mb-2">Check your inbox</p>
        <p className="text-[15px] font-medium text-emerald-700 dark:text-emerald-500">
          If an account exists for <strong>{email}</strong>, we just sent you a reset link.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="block text-[15px] font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Email Address
        </label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-4 py-3.5 text-[15px] font-medium text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-600 shadow-sm"
        />
      </div>
      <button
        type="submit"
        disabled={state === "submitting" || !email}
        className="mt-6 flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3.5 text-[15px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-sm"
      >
        {state === "submitting" ? "Sending link…" : "Send reset link"}
      </button>
      {errorMsg && (
        <div className="mt-2 text-[15px] font-medium text-rose-700 dark:text-rose-400 text-center">
          {errorMsg}
        </div>
      )}
    </form>
  );
}
