import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";
import { CreateSeriesError, createSeries } from "@/server/series/create";

const accessEntrySchema = z.object({
  userId: z.string().uuid(),
  canView: z.boolean(),
  canInterview: z.boolean(),
});

const createSeriesSchema = z.object({
  title: z.string().trim().min(1, "Give the series a title."),
  goal: z.string().trim().min(1, "Say what Anna should learn."),
  subjectKind: z.enum(["member", "self", "person", "organization"]),
  subjectUserId: z.string().uuid().optional(),
  subjectName: z.string().trim().min(1, "This series needs a subject name."),
  subjectRelationship: z.string().trim().optional(),
  openingPrompt: z.string().trim().optional(),
  mustCover: z.array(z.string().trim().min(1)).default([]),
  dontBringUp: z.array(z.string().trim().min(1)).default([]),
  tone: z.enum(["warm", "neutral", "playful"]),
  sessionMinutes: z.union([z.literal(10), z.literal(20), z.literal(45)]),
  access: z.array(accessEntrySchema).default([]),
  inviteSubjectEmail: z.string().email().optional(),
  questionPlan: z.array(z.string().trim().min(1)).optional(),
});

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
