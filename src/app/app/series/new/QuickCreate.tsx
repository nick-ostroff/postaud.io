"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { inputClasses, textareaClasses } from "./formkit";
import type { MemberOption } from "./formkit";
import { DEFAULT_INTERVIEWER_NAME, DEFAULT_VOICE } from "@/lib/voices";

/**
 * Condensed create form per `Postaudio Admin.dc.html#1d` — title/subject/goal
 * → Create. Only offers "myself" or an existing member as the subject (no
 * inline invite, no guide rails); anything more goes through the full wizard.
 */
export function QuickCreate({
  members,
  viewer,
}: {
  members: MemberOption[];
  viewer: { userId: string; name: string };
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subjectChoice, setSubjectChoice] = useState("");
  const [goal, setGoal] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && goal.trim().length > 0 && subjectChoice.length > 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setState("submitting");
    setError(null);

    const isSelf = subjectChoice === "self";
    const member = isSelf ? undefined : members.find((m) => m.userId === subjectChoice);

    const payload = {
      title: title.trim(),
      goal: goal.trim(),
      subjectKind: isSelf ? "self" : "member",
      subjectUserId: isSelf ? undefined : member?.userId,
      subjectName: isSelf ? viewer.name : member?.name ?? "",
      mustCover: [],
      dontBringUp: [],
      tone: "warm",
      sessionMinutes: 20,
      voice: DEFAULT_VOICE,
      interviewerName: DEFAULT_INTERVIEWER_NAME,
      depth: "balanced",
      plannedSessions: null,
      access: [],
    };

    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setState("error");
        setError(body?.message ?? body?.error ?? "Could not create series.");
        return;
      }
      router.push(`/app/series/${body.id}`);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center">
      <Card className="w-full max-w-[470px] px-6 py-6">
        <div className="mb-1 flex items-start justify-between gap-4">
          <h2 className="serif text-[20px]">New series</h2>
          <Link href="/app" className="text-[14px] text-faint" title="Close">
            ✕
          </Link>
        </div>
        <p className="mb-4 text-[13px] text-muted">Just the essentials — Anna can take it from here.</p>

        <form onSubmit={onSubmit}>
          <Field label="Title">
            <input
              className={inputClasses}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What should we call it?"
            />
          </Field>
          <Field label="Who is it about?" hint="Need someone without an account? Use the full wizard below.">
            <select className={inputClasses} value={subjectChoice} onChange={(e) => setSubjectChoice(e.target.value)}>
              <option value="" disabled>
                Choose a member
              </option>
              <option value="self">Myself</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.pending ? " · invited" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What should Anna learn?">
            <textarea
              className={textareaClasses}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="A sentence or two is plenty — this shapes every question."
            />
          </Field>

          <Button
            type="submit"
            variant="primary"
            size="big"
            disabled={!canSubmit || state === "submitting"}
            className="w-full justify-center"
          >
            {state === "submitting" ? "Creating…" : "Create"}
          </Button>
          {error && <div className="mt-2 text-center text-xs font-medium text-amber">{error}</div>}
        </form>

        <p className="mt-3 text-center text-[13px] text-muted">
          Need guide rails? <Link href="/app/series/new">Use the full wizard</Link>
        </p>
      </Card>
    </div>
  );
}
