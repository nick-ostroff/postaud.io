import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";
import type { TablesUpdate } from "@/db/types";
import { personaFor, VOICE_IDS } from "@/lib/voices";

const updateSeriesSchema = z.object({
  title: z.string().trim().min(1).optional(),
  goal: z.string().trim().min(1).optional(),
  subjectRelationship: z.string().trim().optional(),
  openingPrompt: z.string().trim().optional(),
  dontBringUp: z.array(z.string().trim().min(1)).optional(),
  tone: z.enum(["warm", "neutral", "playful"]).optional(),
  sessionMinutes: z.union([z.literal(10), z.literal(20), z.literal(45)]).optional(),
  voice: z.enum(VOICE_IDS).optional(),
  conversationMode: z.enum(["deep", "flow", "quickfire"]).optional(),
  askModeEachTime: z.boolean().optional(),
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
    tone,
    sessionMinutes,
    voice,
    conversationMode,
    askModeEachTime,
    plannedSessions,
  } = parsed.data;
  const update: TablesUpdate<"series"> = {};
  if (title !== undefined) update.title = title;
  if (goal !== undefined) update.goal = goal;
  if (subjectRelationship !== undefined) update.subject_relationship = subjectRelationship;
  if (openingPrompt !== undefined) update.opening_prompt = openingPrompt;
  if (dontBringUp !== undefined) update.dont_bring_up = dontBringUp;
  if (tone !== undefined) update.tone = tone;
  if (sessionMinutes !== undefined) update.session_minutes = sessionMinutes;
  // Changing the voice re-derives the name with it — the two never drift apart.
  if (voice !== undefined) {
    const persona = personaFor(voice);
    update.voice = persona.id;
    update.interviewer_name = persona.name;
  }
  if (conversationMode !== undefined) update.conversation_mode = conversationMode;
  if (askModeEachTime !== undefined) update.ask_mode_each_time = askModeEachTime;
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

// DELETE /api/series/[id] — archive, not a row delete: sets status='archived'
// so history (interviews, facts, topics) stays intact. Admin-only.
export async function DELETE(_request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { supabase, organization, role } = await getViewer();
  if (!organization || role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
