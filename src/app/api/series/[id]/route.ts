import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { AUDIO_BUCKET } from "@/server/facts/audio-url";
import { SERIES_AVATAR_BUCKET } from "@/server/series/photo-url";
import type { TablesUpdate } from "@/db/types";
import { personaFor, VOICE_IDS } from "@/lib/voices";

const updateSeriesSchema = z.object({
  title: z.string().trim().min(1).optional(),
  goal: z.string().trim().min(1).optional(),
  subjectRelationship: z.string().trim().optional(),
  openingPrompt: z.string().trim().optional(),
  dontBringUp: z.array(z.string().trim().min(1)).optional(),
  // Total talk time for the WHOLE series, in minutes; null = unlimited.
  totalMinutes: z.union([z.literal(10), z.literal(20), z.literal(45)]).nullable().optional(),
  voice: z.enum(VOICE_IDS).optional(),
  conversationMode: z.enum(["flow", "quickfire", "ritual"]).optional(),
  plannedSessions: z.number().int().min(1).max(50).nullable().optional(),
});

type Params = Promise<{ id: string }>;

// PATCH /api/series/[id] — edit guide-rail fields. Admin-only; scoped to the
// caller's org (RLS's "series admin" policy would also reject this, but the
// role check here lets us return a clean 403 before touching the DB).
export async function PATCH(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { supabase, organization, role } = await getViewer();
  if (!organization || role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = updateSeriesSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const {
    title,
    goal,
    subjectRelationship,
    openingPrompt,
    dontBringUp,
    totalMinutes,
    voice,
    conversationMode,
    plannedSessions,
  } = parsed.data;
  const update: TablesUpdate<"series"> = {};
  if (title !== undefined) update.title = title;
  if (goal !== undefined) update.goal = goal;
  if (subjectRelationship !== undefined) update.subject_relationship = subjectRelationship;
  if (openingPrompt !== undefined) update.opening_prompt = openingPrompt;
  if (dontBringUp !== undefined) update.dont_bring_up = dontBringUp;
  if (totalMinutes !== undefined) update.total_minutes = totalMinutes;
  // Changing the voice re-derives the name with it — the two never drift apart.
  if (voice !== undefined) {
    const persona = personaFor(voice);
    update.voice = persona.id;
    update.interviewer_name = persona.name;
  }
  if (conversationMode !== undefined) update.conversation_mode = conversationMode;
  if (plannedSessions !== undefined) update.planned_sessions = plannedSessions;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("series")
    .update(update)
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/series/[id] — archive by default: sets status='archived' so
// history (interviews, facts, topics) stays intact. With ?permanent=1 it's a
// real row delete — every session, memory, topic, and queued question cascades
// away, and the audio recordings + series photo are removed from storage.
// Admin-only either way.
export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { user, supabase, organization, role } = await getViewer();
  if (!organization || role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const permanent = new URL(request.url).searchParams.get("permanent") === "1";

  if (!permanent) {
    const { data, error } = await supabase
      .from("series")
      .update({ status: "archived" })
      .eq("id", id)
      .eq("organization_id", organization.id)
      .select("id")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  }

  // Permanent delete — RLS has no delete policies on series' child tables, so
  // this runs on the service client after the explicit admin + org check above.
  const svc = serviceClient();
  const { data: series, error: loadErr } = await svc
    .from("series")
    .select("id, organization_id, photo_path")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!series || series.organization_id !== organization.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Collect audio paths before the cascade wipes the interview rows.
  const { data: interviewRows, error: audioErr } = await svc
    .from("interviews")
    .select("audio_path")
    .eq("series_id", id);
  if (audioErr) return NextResponse.json({ error: audioErr.message }, { status: 500 });
  const audioPaths = (interviewRows ?? [])
    .map((i) => i.audio_path)
    .filter((p): p is string => !!p);

  const { error: delErr } = await svc.from("series").delete().eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // Best-effort storage cleanup: the rows are already gone; stray objects
  // aren't worth failing the request over.
  if (audioPaths.length > 0) {
    const { error: storageErr } = await svc.storage.from(AUDIO_BUCKET).remove(audioPaths);
    if (storageErr) console.error("[series.DELETE] audio cleanup failed", storageErr);
  }
  if (series.photo_path) {
    const { error: photoErr } = await svc.storage.from(SERIES_AVATAR_BUCKET).remove([series.photo_path]);
    if (photoErr) console.error("[series.DELETE] photo cleanup failed", photoErr);
  }

  const { error: auditErr } = await svc.from("audit_logs").insert({
    organization_id: organization.id,
    actor_user_id: user.id,
    action: "series.deleted",
    target_type: "series",
    target_id: id,
    meta: { audioFilesRemoved: audioPaths.length },
  });
  if (auditErr) {
    // Non-fatal — same tradeoff as the facts route's audit write.
    console.error("[series.DELETE] audit log failed", auditErr);
  }

  return NextResponse.json({ ok: true });
}
