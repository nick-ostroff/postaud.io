import { NextResponse } from "next/server";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { AUDIO_BUCKET } from "@/server/facts/audio-url";

type Params = Promise<{ id: string }>;

/**
 * DELETE /api/interviews/[id] — permanently remove one session and everything
 * it produced: the memories it added, the transcript, summary, and usage rows
 * (FK cascade), and the audio recording in storage. Admin-only, like archiving
 * a series — this is the "that session was a mistake" escape hatch.
 *
 * Facts do NOT cascade (`facts.source_interview_id` is ON DELETE SET NULL, so
 * orphaned memories would survive the row delete) — they're deleted explicitly
 * first. Any older fact one of them superseded is restored to 'active' so the
 * knowledge base doesn't keep a hole where the replaced memory used to be.
 *
 * RLS has no delete policies on interviews/facts, so the writes run on the
 * service client after the explicit admin + org check.
 */
export async function DELETE(_request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { user, organization, role } = await getViewer();
  if (!organization || role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const svc = serviceClient();
  const { data: interview, error: loadErr } = await svc
    .from("interviews")
    .select("id, series_id, organization_id, audio_path, started_at")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!interview || interview.organization_id !== organization.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Stamp the spend ledger with a human-readable label BEFORE the row delete
  // orphans it (interview_id goes null via SET NULL) — the workspace activity
  // log keeps showing "which session this money bought" after the session is
  // gone.
  const [{ data: seriesRow }, { count: sessionNumber }] = await Promise.all([
    svc.from("series").select("title").eq("id", interview.series_id).maybeSingle(),
    svc
      .from("interviews")
      .select("id", { count: "exact", head: true })
      .eq("series_id", interview.series_id)
      .lte("started_at", interview.started_at),
  ]);
  const contextLabel = `${seriesRow?.title ?? "Deleted series"} — Session ${sessionNumber ?? "?"} (deleted)`;
  const { error: stampErr } = await svc
    .from("interview_usage")
    .update({ context_label: contextLabel })
    .eq("interview_id", id);
  if (stampErr) return NextResponse.json({ error: stampErr.message }, { status: 500 });

  const { data: factRows, error: factsErr } = await svc
    .from("facts")
    .select("id")
    .eq("source_interview_id", id);
  if (factsErr) return NextResponse.json({ error: factsErr.message }, { status: 500 });
  const factIds = (factRows ?? []).map((f) => f.id);

  if (factIds.length > 0) {
    const { error: restoreErr } = await svc
      .from("facts")
      .update({ status: "active", superseded_by: null })
      .in("superseded_by", factIds)
      .eq("status", "superseded");
    if (restoreErr) return NextResponse.json({ error: restoreErr.message }, { status: 500 });

    const { error: delFactsErr } = await svc.from("facts").delete().in("id", factIds);
    if (delFactsErr) return NextResponse.json({ error: delFactsErr.message }, { status: 500 });
  }

  const { error: delErr } = await svc.from("interviews").delete().eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (interview.audio_path) {
    // Best-effort: the DB rows are already gone; a stray audio object isn't
    // worth failing the request over.
    const { error: storageErr } = await svc.storage.from(AUDIO_BUCKET).remove([interview.audio_path]);
    if (storageErr) console.error("[interviews.DELETE] audio cleanup failed", storageErr);
  }

  const { error: auditErr } = await svc.from("audit_logs").insert({
    organization_id: organization.id,
    actor_user_id: user.id,
    action: "interview.deleted",
    target_type: "interview",
    target_id: id,
    meta: { seriesId: interview.series_id, factsDeleted: factIds.length },
  });
  if (auditErr) {
    // Non-fatal — same tradeoff as the facts route's audit write.
    console.error("[interviews.DELETE] audit log failed", auditErr);
  }

  return NextResponse.json({ ok: true, seriesId: interview.series_id });
}
