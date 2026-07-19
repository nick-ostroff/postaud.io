import { NextResponse } from "next/server";
import { z } from "zod";
import { getSeriesForUser, getViewer } from "@/db/queries";
import { VOICE_IDS, DEFAULT_VOICE } from "@/lib/voices";
import { CreateSeriesError, createSeries } from "@/server/series/create";
import { resolveApiToken } from "@/server/auth/bearer";

const accessEntrySchema = z.object({
  userId: z.string().uuid(),
  canView: z.boolean(),
  canInterview: z.boolean(),
});

export const createSeriesSchema = z.object({
  title: z.string().trim().min(1, "Give the series a title."),
  goal: z.string().trim().min(1, "Say what the interviewer should learn."),
  subjectKind: z.enum(["member", "self", "person", "organization"]),
  subjectUserId: z.string().uuid().optional(),
  subjectName: z.string().trim().min(1, "This series needs a subject name."),
  subjectRelationship: z.string().trim().optional(),
  openingPrompt: z.string().trim().optional(),
  mustCover: z.array(z.string().trim().min(1)).default([]),
  dontBringUp: z.array(z.string().trim().min(1)).default([]),
  tone: z.enum(["warm", "neutral", "playful"]),
  sessionMinutes: z.union([z.literal(10), z.literal(20), z.literal(45)]),
  voice: z.enum(VOICE_IDS).default(DEFAULT_VOICE),
  depth: z.enum(["single", "light", "balanced", "deep"]).default("balanced"),
  plannedSessions: z.number().int().min(1).max(50).nullable().default(null),
  access: z.array(accessEntrySchema).default([]),
  inviteSubjectEmail: z.string().email().optional(),
  questionPlan: z.array(z.string().trim().min(1)).optional(),
});

/**
 * GET /api/series?format=json — discovery endpoint for the Obsidian plugin
 * (Task 7): lists the series the caller can see, so the plugin can present a
 * pick list before syncing one via the export route (Task 6). Bearer-only —
 * unlike the export route there is no cookie fallback, since this is
 * plugin-facing only and the browser app has its own series list UI that
 * doesn't need a JSON API. Any other/missing `format` 404s rather than
 * falling through to some other representation, so an unauthenticated poke
 * at this URL (no `?format=json`) can't be used to probe whether the route
 * exists versus genuinely not being found.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("format") !== "json") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // No cookie fallback here (contrast with the export route's
  // `resolveCaller`) — `resolveApiToken` returning null covers every failure
  // mode (missing header, malformed, unknown, revoked token) identically by
  // design, so this always 401s rather than risking a 500 from touching a
  // null caller's `.supabase`.
  const caller = await resolveApiToken(request);
  if (!caller) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await getSeriesForUser(caller.supabase);
  return NextResponse.json({
    series: rows.map((s) => ({
      id: s.id,
      title: s.title,
      subjectName: s.subject_name,
      status: s.status,
    })),
  });
}

// POST /api/series — create a series (+ access rows + seeded topics).
// Admin-only: guarded by the caller's own membership role.
export async function POST(request: Request) {
  const { user, supabase, organization, role } = await getViewer();
  if (!organization || role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = createSeriesSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  try {
    const { id } = await createSeries(supabase, {
      orgId: organization.id,
      createdBy: user.id,
      input: parsed.data,
    });
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof CreateSeriesError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create series." },
      { status: 500 },
    );
  }
}
