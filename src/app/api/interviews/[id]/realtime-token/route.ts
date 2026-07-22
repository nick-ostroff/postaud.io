import { NextResponse } from "next/server";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { canInterviewSeries } from "@/server/interviews/access";
import { buildInterviewerInstructions } from "@/server/ai/interviewer-prompt";
import { openaiClient } from "@/server/ai/openai";
import { personaFor } from "@/lib/voices";

type Params = Promise<{ id: string }>;

const REALTIME_MODEL = "gpt-realtime";
const KNOWN_FACTS_LIMIT = 80;

/**
 * POST /api/interviews/[id]/realtime-token — mints a short-lived OpenAI
 * Realtime client secret carrying Anna's full system instructions for this
 * specific session. Instructions are rebuilt fresh from the series' guide
 * rails + live knowledge base on every call (never cached), so a reconnect
 * mid-series always sees the latest facts/coverage state.
 */
export async function POST(_request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { user, supabase, organization, role } = await getViewer();
  if (!organization) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const svc = serviceClient();

  const { data: interview, error: interviewErr } = await svc
    .from("interviews")
    .select("id, series_id, status, hand_the_mic, organization_id, started_at, mode")
    .eq("id", id)
    .maybeSingle();
  if (interviewErr) {
    return NextResponse.json({ error: interviewErr.message }, { status: 500 });
  }
  if (!interview || interview.organization_id !== organization.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: series, error: seriesErr } = await svc
    .from("series")
    .select(
      "id, subject_user_id, title, subject_name, subject_relationship, goal, opening_prompt, dont_bring_up, tone, session_minutes, voice, interviewer_name, depth, conversation_mode, planned_sessions",
    )
    .eq("id", interview.series_id)
    .maybeSingle();
  if (seriesErr) {
    return NextResponse.json({ error: seriesErr.message }, { status: 500 });
  }
  if (!series) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const canInterview = await canInterviewSeries(supabase, {
    userId: user.id,
    role,
    seriesSubjectUserId: series.subject_user_id,
    seriesId: series.id,
  });
  if (!canInterview) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (interview.status !== "in_progress") {
    return NextResponse.json({ error: "not_in_progress" }, { status: 409 });
  }

  const [topicsRes, activeFactsRes, retellFactsRes, priorRes, queueRes] = await Promise.all([
    svc
      .from("topics")
      .select("id, name, coverage_score, must_cover, suggested")
      .eq("series_id", series.id)
      .order("coverage_score", { ascending: true }),
    svc
      .from("facts")
      .select("statement, topic_id, created_at")
      .eq("series_id", series.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(KNOWN_FACTS_LIMIT),
    svc
      .from("facts")
      .select("statement, created_at")
      .eq("series_id", series.id)
      .eq("status", "retell_queued")
      .order("created_at", { ascending: false }),
    // Session number: count this series' completed/processed interviews
    // started before this one, 1-based. Must match `listInterviewsForSeries`
    // (src/db/queries.ts:391) — including its status filter — since that's
    // the derivation the series page shows the user as "Session N". Without
    // the filter, another conductor's still-in_progress or abandoned
    // interview would inflate the count and desync the number Anna speaks
    // from the one the page displays. Only needed when the series has a
    // planned-session target to pace against — but it's one indexed count,
    // so we always fetch it rather than branch the Promise.all.
    svc
      .from("interviews")
      .select("id", { count: "exact", head: true })
      .eq("series_id", series.id)
      .in("status", ["completed", "processed"])
      .lt("started_at", interview.started_at),
    svc
      .from("queued_questions")
      .select("id, text")
      .eq("series_id", series.id)
      .eq("status", "pending")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  if (topicsRes.error) {
    return NextResponse.json({ error: topicsRes.error.message }, { status: 500 });
  }
  if (activeFactsRes.error) {
    return NextResponse.json({ error: activeFactsRes.error.message }, { status: 500 });
  }
  if (retellFactsRes.error) {
    return NextResponse.json({ error: retellFactsRes.error.message }, { status: 500 });
  }
  if (queueRes.error) {
    return NextResponse.json({ error: queueRes.error.message }, { status: 500 });
  }
  // A failed count shouldn't kill the interview — degrade to "unknown session
  // number", which just drops the pacing line from the prompt.
  const sessionNumber = priorRes.error ? null : (priorRes.count ?? 0) + 1;

  const topicNameById = new Map((topicsRes.data ?? []).map((t) => [t.id, t.name] as const));
  const knownFacts = (activeFactsRes.data ?? []).map((f) => ({
    topic: (f.topic_id && topicNameById.get(f.topic_id)) || "General",
    statement: f.statement,
  }));
  const retellQueue = (retellFactsRes.data ?? []).map((f) => f.statement);
  const topics = (topicsRes.data ?? []).map((t) => ({
    name: t.name,
    coverageScore: t.coverage_score,
    mustCover: t.must_cover,
    suggested: t.suggested,
  }));
  const dontBringUp = Array.isArray(series.dont_bring_up)
    ? series.dont_bring_up.filter((v): v is string => typeof v === "string")
    : [];

  const persona = personaFor(series.voice);

  // Null mode = an interview started before modes existed (or a legacy row):
  // fall back to the series default, never crash.
  const mode = interview.mode ?? series.conversation_mode;
  const queuedQuestions = (queueRes.data ?? []).map((q) => q.text);

  const instructions = buildInterviewerInstructions({
    series: {
      title: series.title,
      subjectName: series.subject_name,
      subjectRelationship: series.subject_relationship,
      goal: series.goal,
      openingPrompt: series.opening_prompt,
      dontBringUp,
      tone: series.tone,
      sessionMinutes: series.session_minutes,
      // The name always follows the voice, by construction — never the
      // stored `interviewer_name` column. If a voice is ever retired from
      // VOICES, personaFor() degrades the audio to the default (marin/Anna);
      // preferring the stored name here would let a retired series still say
      // "You are Ellis" while speaking in Anna's voice, exactly the
      // voice/name mismatch this feature exists to prevent.
      interviewerName: persona.name,
      depth: series.depth,
      plannedSessions: series.planned_sessions,
    },
    handTheMic: interview.hand_the_mic,
    knownFacts,
    topics,
    retellQueue,
    sessionNumber,
    mode,
    queuedQuestions,
  });

  // Realtime function tools per mode. Shapes verified against
  // node_modules/openai/resources/realtime/realtime.d.ts (RealtimeFunctionTool):
  // { type: "function", name, description, parameters } — parameters is a raw
  // JSON-schema object.
  const FLOW_TOOLS = [
    {
      type: "function" as const,
      name: "propose_followups",
      description:
        "Immediately after the subject finishes an answer, propose 2-3 short follow-up questions that " +
        "build on what they just said. The subject picks one on screen; stay silent until the result arrives.",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 3,
            description: "Distinct, specific, one-sentence follow-up questions.",
          },
        },
        required: ["questions"],
      },
    },
  ];

  const QUICKFIRE_TOOLS = [
    {
      type: "function" as const,
      name: "mark_question_asked",
      description:
        "Call after the subject finishes answering an item from the QUESTION LIST, before asking the next " +
        "one. index is the item's 1-based number in the list; total is the list length.",
      parameters: {
        type: "object",
        properties: {
          index: { type: "number" },
          total: { type: "number" },
        },
        required: ["index", "total"],
      },
    },
  ];

  const tools = mode === "flow" ? FLOW_TOOLS : mode === "quickfire" ? QUICKFIRE_TOOLS : undefined;

  try {
    const client = openaiClient();
    const response = await client.realtime.clientSecrets.create({
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions,
        ...(tools ? { tools, tool_choice: "auto" as const } : {}),
        audio: {
          input: {
            transcription: { model: "whisper-1" },
            // Semantic VAD at low eagerness waits up to ~8s for the subject to
            // keep going before Anna responds — oral-history subjects pause
            // mid-memory, and server_vad's 500ms default makes her cut in and
            // rush the conversation forward.
            turn_detection: { type: "semantic_vad", eagerness: "low" },
          },
          output: { voice: persona.id },
        },
      },
    });
    // response.session is a realtime|transcription union — only the realtime
    // variant (what we requested) carries `model`, so narrow defensively
    // rather than asserting the type.
    const model = "model" in response.session ? response.session.model : undefined;
    return NextResponse.json({
      clientSecret: response.value,
      model: model ?? REALTIME_MODEL,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not mint realtime token." },
      { status: 500 },
    );
  }
}
