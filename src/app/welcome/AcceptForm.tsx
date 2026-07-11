"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/db/client";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

const inputClasses =
  "w-full rounded-sm border border-line-strong bg-card px-[13px] py-2.5 text-[14px] text-ink focus:border-green focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-green";

export function AcceptForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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
    if (password !== confirm) {
      setState("error");
      setErrorMsg("Passwords don't match.");
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
    <form onSubmit={onSubmit}>
      <Field label="Choose a password">
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className={inputClasses}
        />
      </Field>
      <Field label="Confirm password" hint="At least 10 characters — a short sentence works well.">
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className={inputClasses}
        />
      </Field>

      {errorMsg && <div className="mb-3 text-[13px] font-medium text-amber">{errorMsg}</div>}

      <Button
        type="submit"
        variant="primary"
        size="big"
        className="w-full justify-center"
        disabled={state === "submitting"}
      >
        {state === "submitting" ? "Joining…" : "Accept & join"}
      </Button>
    </form>
  );
}
