"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inputBase } from "@/components/ui/Input";
import type { MemberRole } from "@/db/types";

const ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
  { value: "interviewer", label: "Interviewer" },
  { value: "viewer", label: "Viewer" },
  { value: "admin", label: "Admin" },
];

// Typed error codes from `POST /api/members` (see `InviteMemberError` in
// src/server/members/invite.ts) mapped to user-facing copy.
const ERROR_MESSAGES: Record<string, string> = {
  already_member: "Already a member of this workspace.",
  in_other_workspace: "That email already belongs to another postaud.io workspace.",
};

export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("interviewer");
  const [state, setState] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setState("error");
        setErrorMsg((body?.error && ERROR_MESSAGES[body.error]) ?? body?.error ?? "Could not send invite.");
        return;
      }
      setEmail("");
      setState("sent");
      router.refresh();
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <Card className="mb-[22px] px-[22px] py-5">
      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2.5">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setState("idle");
            setErrorMsg(null);
          }}
          placeholder="Invite someone — name@email.com"
          className={`w-full max-w-[380px] flex-1 ${inputBase}`}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          className={`w-[160px] ${inputBase}`}
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={state === "submitting" || !email}>
          {state === "submitting" ? "Sending…" : "Send invite"}
        </Button>
      </form>
      <div className="mt-[9px] text-xs text-faint">
        Admins manage everything · Interviewers run sessions on series they&apos;re given · Viewers read what
        they&apos;re shown.
      </div>
      {state === "sent" && <div className="mt-2 text-xs font-medium text-green-deep">Invite sent.</div>}
      {errorMsg && <div className="mt-2 text-xs font-medium text-amber">{errorMsg}</div>}
    </Card>
  );
}
