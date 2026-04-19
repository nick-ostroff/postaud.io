"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReprocessButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setState("running");
    setErr(null);
    const res = await fetch("/api/jobs/process-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setState("error");
      setErr(j?.error?.code ?? `HTTP ${res.status}`);
      return;
    }
    setState("done");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        disabled={state === "running"}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === "running"
          ? "Processing…"
          : state === "done"
          ? "Re-processed ✓"
          : "Run AI pipeline"}
      </button>
      {err && <span className="text-xs text-rose-700">{err}</span>}
    </div>
  );
}
