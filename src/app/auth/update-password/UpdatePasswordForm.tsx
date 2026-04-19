"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/db/client";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setState("error");
        setErrorMsg(error.message);
        return;
      }
      router.push("/app");
      router.refresh();
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="block text-[15px] font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          New Password
        </label>
        <input
          type="password"
          required
          minLength={8}
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-4 py-3.5 text-[15px] font-medium text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
        />
      </div>
      <button
        type="submit"
        disabled={state === "submitting" || password.length < 8}
        className="mt-6 flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3.5 text-[15px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-sm"
      >
        {state === "submitting" ? "Saving…" : "Save new password"}
      </button>
      {errorMsg && (
        <div className="mt-2 text-[15px] font-medium text-rose-700 dark:text-rose-400 text-center">
          {errorMsg}
        </div>
      )}
    </form>
  );
}
