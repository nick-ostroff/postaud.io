"use client";

import { useState } from "react";

export function ImpersonateButton({ orgId }: { orgId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "logged" | "error">("idle");

  async function handleClick() {
    setState("loading");
    try {
      const res = await fetch("/api/admin/impersonation-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) throw new Error("request failed");
      setState("logged");
    } catch {
      setState("error");
    }
  }

  if (state === "logged") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/40 bg-emerald-50 px-3.5 py-2 text-[13px] font-medium text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300">
        ✓ Request logged
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "loading"}
        className="rounded-lg border border-emerald-600/50 bg-white px-3.5 py-2 text-[13px] font-medium text-emerald-800 hover:border-emerald-700 disabled:opacity-60 dark:bg-[#111] dark:text-emerald-300"
      >
        {state === "loading" ? "Logging…" : "⚿ Impersonate (audited)"}
      </button>
      {state === "error" && <span className="text-[11.5px] text-rose-600">Could not log request — try again.</span>}
    </div>
  );
}
