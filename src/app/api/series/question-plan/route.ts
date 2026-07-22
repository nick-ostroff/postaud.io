import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";
import { draftQuestionPlan } from "@/server/ai/question-plan";

const questionPlanSchema = z.object({
  title: z.string().trim().min(1),
  subjectName: z.string().trim().min(1),
  subjectRelationship: z.string().trim().optional(),
  goal: z.string().trim().min(1),
  openingPrompt: z.string().trim().optional(),
  mustCover: z.array(z.string().trim().min(1)).default([]),
  // Tone is no longer a wizard control — default warm keeps the drafting
  // prompt stable for callers that stop sending it.
  tone: z.enum(["warm", "neutral", "playful"]).default("warm"),
});

// POST /api/series/question-plan — Anna drafts 5–7 opening-session questions
// from the wizard's steps 1–3 data. Admin-only, same guard as /api/series;
// the wizard degrades gracefully (empty, fully-editable list) on any non-200.
export async function POST(request: Request) {
  let organization, role;
  try {
    ({ organization, role } = await getViewer());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!organization || role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = questionPlanSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  try {
    const questions = await draftQuestionPlan(parsed.data);
    return NextResponse.json({ questions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not draft the question plan." },
      { status: 500 },
    );
  }
}
