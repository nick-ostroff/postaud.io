"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/db/client";

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
      <div className="mt-6 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 p-6 text-center shadow-sm">
        <p className="text-xl font-medium text-emerald-800 dark:text-emerald-400 mb-2">Check your inbox</p>
        <p className="text-[15px] font-medium text-emerald-700 dark:text-emerald-500">
          We sent a secure link to <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={mode === "password" ? submitPassword : submitMagic}
      className="space-y-5"
    >
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
          placeholder="you@company.com"
          autoComplete="email"
          className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-4 py-3.5 text-[15px] font-medium text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-600 shadow-sm"
        />
      </div>

      {mode === "password" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[15px] font-medium text-neutral-700 dark:text-neutral-300">
              Password
            </label>
            <Link
              href="/auth/reset"
              className="text-[13px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Forgot?
            </Link>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-4 py-3.5 text-[15px] font-medium text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={state === "submitting" || !email || (mode === "password" && !password)}
        className="mt-6 flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3.5 text-[15px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-sm"
      >
        {state === "submitting"
          ? mode === "password" ? "Signing in…" : "Sending link…"
          : mode === "password" ? "Sign in" : "Email me a sign-in link"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "password" ? "magic" : "password");
          setState("idle");
          setErrorMsg(null);
        }}
        className="w-full text-center text-[14px] font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
      >
        {mode === "password" ? "Email me a link instead" : "Use password instead"}
      </button>

      {errorMsg && (
        <div className="mt-2 text-[15px] font-medium text-rose-700 dark:text-rose-400 text-center">
          {errorMsg}
        </div>
      )}
    </form>
  );
}
