import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeFact, FactAuthError } from "@/server/facts/authorize";

type Params = Promise<{ id: string }>;

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("correct"), statement: z.string().trim().min(3) }),
  z.object({ action: z.literal("retell") }),
]);

/**
 * PATCH /api/facts/[id] — the memories review-and-correct flow (Task 15,
 * mockup #1g). Three actions, guarded the same way as the interview
 * sub-routes: caller must be the fact's series subject, an org admin, or
 * hold explicit `can_interview` access (`authorizeFact`).
 *
 * Spec invariant: transcripts and audio are IMMUTABLE — every branch below
 * only ever touches the `facts` row (statement/status/updated_at) and,
 * for `correct`, an audit-log entry. Nothing here writes to
 * `interview_messages` or storage.
 *
 * - `confirm` → status: 'active' ("That's right" — no change needed).
 * - `correct` → statement: <new>, status: 'active', updated_at: now,
 *   plus an audit_logs 'fact.corrected' row recording the prior statement.
 * - `retell` → status: 'retell_queued' — the next session's interviewer
 *   prompt (Task 9's buildInterviewerInstructions) surfaces it in
 *   RETELL REQUESTS, and processInterview flips it back to 'active' once
 *   that next interview is processed (see process-interview.ts).
 */
export async function PATCH(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  let authed;
  try {
    authed = await authorizeFact(id);
  } catch (err) {
    if (err instanceof FactAuthError) return NextResponse.json(err.body, { status: err.status });
    throw err;
  }

  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { svc, fact, organizationId, userId } = authed;

  if (parsed.data.action === "confirm") {
    const { error } = await svc.from("facts").update({ status: "active" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "retell") {
    const { error } = await svc.from("facts").update({ status: "retell_queued" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // action === "correct"
  const newStatement = parsed.data.statement;
  const { error } = await svc
    .from("facts")
    .update({ statement: newStatement, status: "active", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: auditErr } = await svc.from("audit_logs").insert({
    organization_id: organizationId,
    actor_user_id: userId,
    action: "fact.corrected",
    target_type: "fact",
    target_id: id,
    meta: { factId: id, from: fact.statement },
  });
  if (auditErr) {
    // Non-fatal — the correction already landed; don't fail the request
    // over an audit-trail write (same tradeoff as inviteMember's audit log).
    console.error("[facts.PATCH] audit log failed", auditErr);
  }

  return NextResponse.json({ ok: true });
}
