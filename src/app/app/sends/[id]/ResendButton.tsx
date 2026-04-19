"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResendButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onResend() {
    if (!confirm("Resend the SMS invite to this recipient?")) return;
    setState("sending");
    setErrorMsg(null);

    const res = await fetch(`/api/interview-requests/${requestId}/resend`, { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setState("error");
      setErrorMsg(j?.error?.message ?? `Resend failed (HTTP ${res.status})`);
      return;
    }
    setState("sent");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onResend}
        disabled={state === "sending"}
        className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-3 py-1.5 text-sm text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {state === "sending" ? "Resending…" : state === "sent" ? "Sent ✓" : "Resend SMS"}
      </button>
      {errorMsg && <span className="text-xs text-rose-700 dark:text-rose-400">{errorMsg}</span>}
    </div>
  );
}
