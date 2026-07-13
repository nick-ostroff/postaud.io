"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { joinWaitlistAction } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { WaitlistSource } from "@/server/waitlist/join";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="big" disabled={pending}>
      {pending ? "Joining…" : "Request an invite"}
    </Button>
  );
}

export function WaitlistForm({
  source,
  className = "",
}: {
  source: WaitlistSource;
  className?: string;
}) {
  const [result, formAction] = useActionState(joinWaitlistAction, null);

  if (result?.ok) {
    return (
      <div
        className={`rounded-card border border-green bg-green-tint px-5 py-4 text-center ${className}`}
        role="status"
      >
        <p className="serif text-[17px] text-green-deep">You&rsquo;re on the list.</p>
        <p className="mt-1 text-[13.5px] text-muted">
          We&rsquo;ll be in touch when there&rsquo;s a door to open.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="source" value={source} />

      {/* Honeypot. Off-screen rather than display:none — bots skip hidden
          fields but happily fill ones they can "see" in the DOM. */}
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor={`website-${source}`}>Leave this empty</label>
        <input id={`website-${source}`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Input
          type="email"
          name="email"
          required
          placeholder="you@example.com"
          autoComplete="email"
          aria-label="Email address"
          className="sm:flex-1"
        />
        <SubmitButton />
      </div>

      {result && !result.ok && (
        <p className="mt-2 text-[13px] text-amber" role="alert">
          {result.error}
        </p>
      )}

      <p className="mt-2 text-[12px] text-muted">We&rsquo;ll only email you about PostAud.io.</p>
    </form>
  );
}
