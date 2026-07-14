"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/db/client";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

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
    <form onSubmit={onSubmit}>
      <Field label="New Password">
        <Input
          type="password"
          required
          minLength={8}
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        disabled={state === "submitting" || password.length < 8}
        className="w-full justify-center"
      >
        {state === "submitting" ? "Saving…" : "Save new password"}
      </Button>

      {errorMsg && (
        <p className="mt-4 text-center text-[13px] text-amber" role="alert">
          {errorMsg}
        </p>
      )}
    </form>
  );
}
