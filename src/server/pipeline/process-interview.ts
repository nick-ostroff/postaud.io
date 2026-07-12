import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EntityKind, InterviewMessage, Json, Topic } from "@/db/types";
import { serviceClient } from "@/db/service";
import { extractKnowledge } from "@/server/ai/extract";
import type { Extraction } from "@/server/ai/extract";
import type { PipelineUsage } from "@/server/ai/pipeline-usage";
import { applyMergeDecisions, decideMerges } from "@/server/pipeline/merge";

const MODEL = "claude-sonnet-5";

/** Minimum subject turns for the "every session must add facts" invariant (spec §7). */
const MIN_SUBJECT_TURNS_FOR_FACT_INVARIANT = 4;

type Db = SupabaseClient<Database>;

class NoFactsError extends Error {
  constructor() {
    super("no_facts");
    this.name = "NoFactsError";
  }
}

// ---------------------------------------------------------------------------
// Stage 1: load + extract + invariant guard
// ---------------------------------------------------------------------------

async function runPipeline(db: Db, interviewId: string): Promise<void> {
  const { data: interview, error: ivErr } = await db
    .from("interviews")
    .select("id, series_id, organization_id, status, process_attempts")
    .eq("id", interviewId)
    .maybeSingle();
  if (ivErr) throw new Error(ivErr.message);
  if (!interview) throw new Error(`interview ${interviewId} not found`);

  // Idempotency: already processed → no-op. Anything not yet `completed`
  // (in_progress, abandoned) isn't ours to process either.
  if (interview.status === "processed") return;
  if (interview.status !== "completed") {
    console.warn(`[process-interview] ${interviewId} is '${interview.status}', skipping`);
    return;
  }

  // Atomic claim: two runs can both reach this point for the same interview
  // (the /complete route's fire-and-forget racing the tick's retry sweep, or
  // two overlapping tick sweeps). Reuse `process_attempts` as a cheap CAS
  // token — bump it conditioned on still holding the value we just read; only
  // one concurrent update can match that `.eq`, so exactly one caller sees
  // its row affected and proceeds. The error path's own increment
  // (recordProcessError) reads the current value fresh each time, so it
  // coexists fine with this claim.
  const attemptsAtRead = interview.process_attempts ?? 0;
  const { data: claimed, error: claimErr } = await db
    .from("interviews")
    .update({ process_attempts: attemptsAtRead + 1 })
    .eq("id", interviewId)
    .eq("process_attempts", attemptsAtRead)
    .select("id");
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed || claimed.length === 0) {
    console.warn(`[process-interview] ${interviewId}: lost the claim race to a concurrent run, skipping`);
    return;
  }

  const [{ data: series, error: sErr }, { data: topics, error: tErr }, { data: messages, error: mErr }] =
    await Promise.all([
      db.from("series").select("id, goal, subject_name").eq("id", interview.series_id).maybeSingle(),
      db.from("topics").select("*").eq("series_id", interview.series_id),
      db
        .from("interview_messages")
        .select("id, role, text, t_offset_sec, seq")
        .eq("interview_id", interviewId)
        .order("seq", { ascending: true }),
    ]);
  if (sErr) throw new Error(sErr.message);
  if (!series) throw new Error(`series ${interview.series_id} not found`);
  if (tErr) throw new Error(tErr.message);
  if (mErr) throw new Error(mErr.message);

  const transcript = (messages ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    tOffsetSec: m.t_offset_sec,
  }));
  if (transcript.length === 0) throw new Error(`interview ${interviewId} has no transcript messages`);

  const extractInput = {
    seriesGoal: series.goal,
    subjectName: series.subject_name,
    topics: (topics ?? []).map((t) => ({ name: t.name, description: t.description ?? undefined })),
    transcript,
  };

  // Collects every real Anthropic call's exact usage across this run
  // (extract's own internal schema-parse retry, the invariant-guard's forced
  // retry below, and merge) — persisted once, after a successful pipeline
  // run, by `recordUsage`. Never fabricated: only messages.create calls that
  // actually returned `usage` push a record here.
  const usageRecords: PipelineUsage[] = [];
  const onUsage = (u: PipelineUsage) => usageRecords.push(u);

  let extraction = await extractKnowledge(extractInput, {}, onUsage);

  // Invariant guard (spec §7 "every session must add facts"): a real
  // conversation (≥4 subject turns) that yields zero facts gets one forced
  // retry; if the model still refuses, record no_facts and leave the row
  // `completed` for the tick to retry later.
  const subjectTurns = transcript.filter((m) => m.role === "subject").length;
  if (extraction.facts.length === 0 && subjectTurns >= MIN_SUBJECT_TURNS_FOR_FACT_INVARIANT) {
    extraction = await extractKnowledge(
      extractInput,
      {
        extraInstruction:
          "You must extract at least one fact from this transcript. The subject spoke at length — there is " +
          "always at least one concrete, atomic claim or event in what they said. Find it.",
      },
      onUsage,
    );
    if (extraction.facts.length === 0) throw new NoFactsError();
  }

  await persistExtraction(db, {
    interviewId,
    seriesId: interview.series_id,
    extraction,
    existingTopics: (topics ?? []) as Topic[],
    messages: (messages ?? []) as Pick<InterviewMessage, "id" | "role" | "text" | "t_offset_sec" | "seq">[],
    onUsage,
  });

  // Retell requests (Task 15): every retell_queued fact for this series was
  // offered to Anna in *this* session's instructions (buildInterviewerInstructions'
  // RETELL REQUESTS section, fed by the realtime-token route's retellQueue —
  // it queries every retell_queued fact for the series, not just ones tied to
  // a particular prior interview). Now that this session has been heard and
  // processed, the ask has been made — flip them all back to active so they
  // don't linger in the queue for every future session too. If the subject
  // did retell it, the merge step above will have superseded the old fact
  // with a fresh active one anyway; if they didn't get to it, it simply goes
  // back to being a normal known fact rather than a repeat-forever request.
  await flipRetellQueuedToActive(db, interview.series_id);

  // Mark processed, guarded on the still-completed state; clear any stale error.
  const { data: doneRows, error: doneErr } = await db
    .from("interviews")
    .update({ status: "processed", process_error: null })
    .eq("id", interviewId)
    .eq("status", "completed")
    .select("id");
  if (doneErr) throw new Error(doneErr.message);
  if (!doneRows || doneRows.length === 0) {
    console.warn(`[process-interview] ${interviewId}: mark-processed affected 0 rows (lost the status race)`);
  }

  // Usage accounting must never break processing — the interview is already
  // successfully persisted + marked processed above, so any failure here is
  // logged and swallowed rather than rethrown.
  try {
    await recordUsage(db, interviewId, interview.organization_id, usageRecords);
  } catch (usageErr) {
    console.error(`[process-interview] ${interviewId}: failed to record usage:`, usageErr);
  }
}

/**
 * Persists the run's collected Anthropic usage into `interview_usage`, one
 * row per phase. `extract` can have up to two real API calls in a single run
 * (the schema-parse retry inside extractKnowledge, and/or the invariant
 * guard's forced retry) — those are summed into a single 'extract' row so
 * reprocessing always reflects this interview's true total, not just the
 * last call. Upserts on (interview_id, provider, phase), so a reprocess
 * (Task 13) replaces the prior rows rather than duplicating them.
 */
async function recordUsage(
  db: Db,
  interviewId: string,
  organizationId: string,
  records: PipelineUsage[],
): Promise<void> {
  if (records.length === 0) return;

  const byPhase = new Map<PipelineUsage["phase"], PipelineUsage[]>();
  for (const r of records) {
    const list = byPhase.get(r.phase) ?? [];
    list.push(r);
    byPhase.set(r.phase, list);
  }

  const rows: Database["public"]["Tables"]["interview_usage"]["Insert"][] = [];
  for (const [phase, group] of byPhase) {
    const inputTokens = group.reduce((sum, r) => sum + r.input_tokens, 0);
    const outputTokens = group.reduce((sum, r) => sum + r.output_tokens, 0);
    const cacheRead = group.reduce((sum, r) => sum + (r.cache_read_input_tokens ?? 0), 0);
    const cacheCreation = group.reduce((sum, r) => sum + (r.cache_creation_input_tokens ?? 0), 0);
    rows.push({
      interview_id: interviewId,
      organization_id: organizationId,
      provider: "anthropic",
      phase,
      model: group[group.length - 1].model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      cache_read_input_tokens: cacheRead,
      cache_creation_input_tokens: cacheCreation,
      raw: (group.length === 1 ? group[0].raw : { calls: group.map((r) => r.raw) }) as Json,
    });
  }

  const { error } = await db.from("interview_usage").upsert(rows, { onConflict: "interview_id,provider,phase" });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Stage 2: persist — summaries, topics, facts, entities, coverage
// ---------------------------------------------------------------------------

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

type PersistArgs = {
  interviewId: string;
  seriesId: string;
  extraction: Extraction;
  existingTopics: Topic[];
  messages: Pick<InterviewMessage, "id" | "role" | "text" | "t_offset_sec" | "seq">[];
  onUsage?: (u: PipelineUsage) => void;
};

async function persistExtraction(db: Db, args: PersistArgs): Promise<void> {
  const { interviewId, seriesId, extraction, existingTopics, messages, onUsage } = args;

  // 1) Summary first — it's what the recap page polls for, so it lands ASAP.
  const { error: sumErr } = await db.from("interview_summaries").upsert(
    {
      interview_id: interviewId,
      short: extraction.summary.short,
      long: extraction.summary.long,
      bullets: extraction.summary.bullets,
      model: MODEL,
    },
    { onConflict: "interview_id" },
  );
  if (sumErr) throw new Error(sumErr.message);

  // 2) Topics: name → id map, creating rows for topic names the model
  // introduced. Fact-bearing topics are real covered topics (suggested:false);
  // the model's future-session ideas go in as suggested:true — both appended
  // after the current max position. Names are matched case-insensitively so a
  // model's "childhood" doesn't duplicate an existing "Childhood".
  const topicIdByKey = new Map<string, string>(existingTopics.map((t) => [t.name.trim().toLowerCase(), t.id]));
  let nextPosition = existingTopics.reduce((max, t) => Math.max(max, t.position), -1) + 1;

  const newTopicRows: Database["public"]["Tables"]["topics"]["Insert"][] = [];
  const queueTopic = (name: string, description: string | null, suggested: boolean) => {
    const key = name.trim().toLowerCase();
    if (topicIdByKey.has(key) || newTopicRows.some((r) => r.name.trim().toLowerCase() === key)) return;
    newTopicRows.push({ series_id: seriesId, name: name.trim(), description, suggested, position: nextPosition++ });
  };
  for (const fact of extraction.facts) queueTopic(fact.topic, null, false);
  for (const t of extraction.suggestedTopics) queueTopic(t.name, t.description, true);

  if (newTopicRows.length > 0) {
    // Concurrent interviews in the same series can both try to create the
    // same topic name — a plain insert would 23505 on unique(series_id,
    // name). Upsert with ignoreDuplicates so a racer's row is silently
    // skipped instead of erroring. Skipped conflict rows aren't returned by
    // Postgres, so trust nothing from the response — re-fetch the series'
    // full topic list once and rebuild the name→id map from that.
    const { error: topErr } = await db
      .from("topics")
      .upsert(newTopicRows, { onConflict: "series_id,name", ignoreDuplicates: true })
      .select("id, name");
    if (topErr) throw new Error(topErr.message);

    const { data: allTopics, error: refetchErr } = await db
      .from("topics")
      .select("id, name")
      .eq("series_id", seriesId);
    if (refetchErr) throw new Error(refetchErr.message);
    topicIdByKey.clear();
    for (const t of allTopics ?? []) topicIdByKey.set(t.name.trim().toLowerCase(), t.id);
  }

  // 3) Facts — kept in one function Task 13 wraps with merge/dedupe.
  const factIds = await insertFacts(db, { interviewId, seriesId, extraction, topicIdByKey, messages, onUsage });

  // 4) Entities + fact_entities links.
  await linkEntities(db, seriesId, extraction, factIds);

  // 5) Coverage: only topics that exist (including ones just created), clamped 0..1.
  for (const c of extraction.coverage) {
    const topicId = topicIdByKey.get(c.topic.trim().toLowerCase());
    if (!topicId) continue;
    const { error: covErr } = await db
      .from("topics")
      .update({ coverage_score: clamp01(c.score) })
      .eq("id", topicId);
    if (covErr) throw new Error(covErr.message);
  }
}

/**
 * Merge-aware fact insert: compares incoming facts against the series'
 * existing (non-superseded) knowledge, in-topic only, and applies the
 * resulting insert / skip_duplicate / supersede decisions (Task 13). Returns
 * the new fact ids in the same order as `extraction.facts` — skipped
 * (duplicate) facts leave an empty string in their slot so `linkEntities`
 * (which treats a falsy id as "nothing to link") skips them cleanly.
 */
async function insertFacts(
  db: Db,
  args: {
    interviewId: string;
    seriesId: string;
    extraction: Extraction;
    topicIdByKey: Map<string, string>;
    messages: PersistArgs["messages"];
    onUsage?: (u: PipelineUsage) => void;
  },
): Promise<string[]> {
  const { interviewId, seriesId, extraction, topicIdByKey, messages, onUsage } = args;
  if (extraction.facts.length === 0) return [];

  const messageById = new Map(messages.map((m) => [m.id, m]));

  // Reverse of topicIdByKey (name → id) — topicIdByKey already reflects the
  // series' full current topic set, including any created moments ago for
  // this same extraction.
  const topicNameById = new Map<string, string>();
  for (const [name, id] of topicIdByKey) topicNameById.set(id, name);

  const { data: existingFactRows, error: existingErr } = await db
    .from("facts")
    .select("id, statement, status, topic_id")
    .eq("series_id", seriesId)
    .neq("status", "superseded");
  if (existingErr) throw new Error(existingErr.message);

  const existingForMerge = (existingFactRows ?? [])
    .map((f) => ({
      id: f.id,
      statement: f.statement,
      status: f.status,
      topic: f.topic_id ? (topicNameById.get(f.topic_id) ?? "") : "",
    }))
    .filter((f) => f.topic.length > 0);

  const incomingForMerge = extraction.facts.map((f) => ({ statement: f.statement, topic: f.topic }));
  const decisions = await decideMerges(existingForMerge, incomingForMerge, onUsage);

  // Wrap with the original index so the merged, possibly-shorter `toInsert`
  // list still tells us which slot of `extraction.facts` each row came from.
  const wrapped = extraction.facts.map((f, index) => ({ f, index }));
  const { toInsert } = applyMergeDecisions(wrapped, decisions);

  const factIds: string[] = new Array(extraction.facts.length).fill("");
  if (toInsert.length === 0) return factIds;

  const preparedRows = toInsert.map(({ f, index, supersedesFactId }) => {
    // Validate the model's citation: only ids that exist in this transcript
    // count (a hallucinated id would violate the FK), and the audio offset
    // comes from that message's recorded position.
    const source = f.sourceMessageId ? messageById.get(f.sourceMessageId) : undefined;
    const row: Database["public"]["Tables"]["facts"]["Insert"] = {
      series_id: seriesId,
      topic_id: topicIdByKey.get(f.topic.trim().toLowerCase()) ?? null,
      source_interview_id: interviewId,
      source_message_id: source?.id ?? null,
      audio_offset_sec: source?.t_offset_sec ?? null,
      statement: f.statement,
      confidence: clamp01(f.confidence),
      status: "active",
    };
    return { row, index, supersedesFactId };
  });

  const { data, error } = await db
    .from("facts")
    .insert(preparedRows.map((r) => r.row))
    .select("id");
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length !== preparedRows.length) throw new Error("facts insert returned an unexpected row count");

  const supersessions: { oldId: string; newId: string }[] = [];
  preparedRows.forEach((prepared, i) => {
    const newId = ids[i];
    factIds[prepared.index] = newId;
    if (prepared.supersedesFactId) supersessions.push({ oldId: prepared.supersedesFactId, newId });
  });

  for (const { oldId, newId } of supersessions) {
    const { error: supersedeErr } = await db
      .from("facts")
      .update({ status: "superseded", superseded_by: newId })
      .eq("id", oldId);
    if (supersedeErr) throw new Error(supersedeErr.message);
  }

  return factIds;
}

/**
 * Flips every `retell_queued` fact in a series back to `active` — called
 * once per successfully processed interview (see the call site's comment in
 * `runPipeline` for why "all of them" is the correct scope, not just facts
 * tied to this particular interview).
 */
async function flipRetellQueuedToActive(db: Db, seriesId: string): Promise<void> {
  const { error } = await db
    .from("facts")
    .update({ status: "active" })
    .eq("series_id", seriesId)
    .eq("status", "retell_queued");
  if (error) throw new Error(error.message);
}

/** Upserts entities on (series_id, kind, name) and links them to their facts. */
async function linkEntities(db: Db, seriesId: string, extraction: Extraction, factIds: string[]): Promise<void> {
  const entityKey = (kind: EntityKind, name: string) => `${kind} ${name.trim().toLowerCase()}`;

  const uniqueEntities = new Map<string, { kind: EntityKind; name: string }>();
  for (const fact of extraction.facts) {
    for (const e of fact.entities) {
      const key = entityKey(e.kind, e.name);
      if (!uniqueEntities.has(key)) uniqueEntities.set(key, { kind: e.kind, name: e.name.trim() });
    }
  }
  if (uniqueEntities.size === 0) return;

  const { data: entityRows, error: entErr } = await db
    .from("entities")
    .upsert(
      [...uniqueEntities.values()].map((e) => ({ series_id: seriesId, kind: e.kind, name: e.name })),
      { onConflict: "series_id,kind,name" },
    )
    .select("id, kind, name");
  if (entErr) throw new Error(entErr.message);

  const entityIdByKey = new Map((entityRows ?? []).map((e) => [entityKey(e.kind, e.name), e.id]));

  const links: Database["public"]["Tables"]["fact_entities"]["Insert"][] = [];
  extraction.facts.forEach((fact, i) => {
    const factId = factIds[i];
    if (!factId) return;
    for (const e of fact.entities) {
      const entityId = entityIdByKey.get(entityKey(e.kind, e.name));
      if (entityId && !links.some((l) => l.fact_id === factId && l.entity_id === entityId)) {
        links.push({ fact_id: factId, entity_id: entityId });
      }
    }
  });
  if (links.length === 0) return;

  const { error: linkErr } = await db.from("fact_entities").upsert(links, { onConflict: "fact_id,entity_id" });
  if (linkErr) throw new Error(linkErr.message);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Post-interview knowledge pipeline: transcript → facts / entities / summary /
 * coverage. Called fire-and-forget by the complete route (which `.catch()`es),
 * and later retried by the tick for rows left in `completed` with a
 * `process_error`.
 *
 * Behavior contract:
 * - Idempotent: an already-`processed` interview is a no-op.
 * - Invariant guard (spec §7): a transcript with ≥4 subject turns must yield
 *   at least one fact — one forced retry, then `process_error='no_facts'`
 *   with status left `completed` so the tick can retry.
 * - On any other failure: records `process_error` + increments
 *   `process_attempts` in the DB, then rethrows (callers already .catch()).
 */
export async function processInterview(interviewId: string): Promise<void> {
  const db = serviceClient();
  try {
    await runPipeline(db, interviewId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordProcessError(db, interviewId, message);
    if (err instanceof NoFactsError) {
      // Soft-fail: recorded as no_facts for the tick to retry; don't blow up
      // the fire-and-forget caller's error log with an expected state.
      console.warn(`[process-interview] ${interviewId}: extraction produced zero facts, left for retry`);
      return;
    }
    throw err;
  }
}

/** Best-effort error bookkeeping — never throws (we're already on the error path). */
async function recordProcessError(db: Db, interviewId: string, message: string): Promise<void> {
  try {
    const { data } = await db
      .from("interviews")
      .select("process_attempts")
      .eq("id", interviewId)
      .maybeSingle();
    await db
      .from("interviews")
      .update({
        process_error: message.slice(0, 500),
        process_attempts: (data?.process_attempts ?? 0) + 1,
      })
      .eq("id", interviewId);
  } catch (recordErr) {
    console.error(`[process-interview] failed to record process_error for ${interviewId}:`, recordErr);
  }
}
