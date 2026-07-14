"use client";

import { useState } from "react";

export function ImpersonateButton({
  userId,
  label = "⚿ Log in as user",
  className,
}: {
  userId: string;
  label?: string;
  /** Overrides the button's own visual classes (border/radius/color/etc).
   *  Omit to keep the default emerald pill used by the table and profile
   *  header call sites — passing this only swaps the button's look, the
   *  wrapper switches to a stretch layout so it can share width with
   *  sibling buttons (e.g. an equal-width action row). */
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function handleClick() {
    setState("loading");
    try {
      const res = await fetch("/api/super/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "failed");
      // Full reload, not a client nav — the auth cookies just changed and every
      // cached server payload in the router belongs to the operator, not the
      // user we're now impersonating.
      window.location.href = json.redirect ?? "/app";
    } catch {
      setState("error");
    }
  }

  return (
    <div className={className ? "flex flex-1 flex-col items-stretch gap-1" : "inline-flex flex-col items-end gap-1"}>
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "loading"}
        className={
          className ??
          "rounded-lg border border-emerald-600/50 bg-white px-3.5 py-2 text-[13px] font-medium text-emerald-800 hover:border-emerald-700 disabled:opacity-60 dark:bg-[#111] dark:text-emerald-300"
        }
      >
        {state === "loading" ? "Starting…" : label}
      </button>
      {state === "error" && <span className="text-[11.5px] text-rose-600">Could not start session.</span>}
    </div>
  );
}
