"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/db/client";
import { Button } from "@/components/ui/Button";

const authInput =
  "w-full rounded-xl border border-line-strong bg-card px-4 py-3.5 text-[15px] text-ink placeholder:text-faint focus:border-green focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-green";

/**
 * Invited first login (mockup 6b) — one field, one button. The confirm-password
 * field is gone: a "Show" toggle catches typos better than asking someone to
 * type the same thing twice on a phone keyboard, and a mistyped password is
 * recoverable via /auth/reset anyway.
 */
export function AcceptForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [state, setState] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 10) {
      setState("error");
      setErrorMsg("Use at least 10 characters — a short sentence works well.");
      return;
    }

    setState("submitting");
    try {
      const supabase = createClient();
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) {
        setState("error");
        setErrorMsg(pwError.message);
        return;
      }

      const res = await fetch("/welcome/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setState("error");
        setErrorMsg(body?.error ?? "Could not finish joining the workspace.");
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-password" className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-muted">
          Set a password
        </label>
        <div className="relative">
          <input
            id="new-password"
            type={show ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className={`${authInput} pr-16`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-muted hover:text-ink"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <p className="text-xs text-faint">At least 10 characters — a short sentence works well.</p>
      </div>

      {errorMsg && (
        <p className="text-[13px] font-medium text-amber" role="alert">
          {errorMsg}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="big"
        className="w-full justify-center"
        disabled={state === "submitting"}
      >
        {state === "submitting" ? "Joining…" : "Accept & continue"}
      </Button>
    </form>
  );
}
