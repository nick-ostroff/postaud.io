import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/db/server";
import { serviceClient } from "@/db/service";
import type {
  Database,
  Entity,
  EntityKind,
  Fact,
  FactStatus,
  Interview,
  InterviewMessage,
  InterviewSummary,
  InterviewUsage,
  Membership,
  Series,
  Topic,
} from "@/db/types";

/**
 * Idempotently creates the `public.users` row, a default organization, and an
 * owner membership for a just-authenticated user. Uses the service-role client
 * so RLS doesn't block the inserts (the `authenticated` role has no INSERT
 * policy on those tables — only the service role should write them).
 */
export async function ensureViewerBootstrapped(args: {
  id: string;
  email: string;
  displayName: string | null;
}) {
  const svc = serviceClient();

  await svc.from("users").upsert(
    { id: args.id, email: args.email, display_name: args.displayName },
    { onConflict: "id" },
  );

  // Use limit(1) instead of maybeSingle(): maybeSingle errors when there are
  // multiple rows, which caused duplicate orgs to snowball on each page load.
  const { data: existing } = await svc
    .from("memberships")
    .select("organization_id")
    .eq("user_id", args.id)
    .limit(1);
  if (existing && existing.length > 0) return;

  const orgName = args.email?.split("@")[0] || "Workspace";
  const { data: org, error: orgErr } = await svc
    .from("organizations")
    .insert({ name: orgName })
    .select("id")
    .single();
  if (orgErr || !org) throw new Error(orgErr?.message ?? "Could not create organization");

  // accepted_at is set immediately: this is an organic signup creating their
  // own workspace, not an invited member who still needs the /welcome accept
  // flow (see inviteMember, which explicitly leaves accepted_at null).
  const { error: mErr } = await svc
    .from("memberships")
    .insert({
      user_id: args.id,
      organization_id: org.id,
      role: "admin",
      accepted_at: new Date().toISOString(),
    });
  if (mErr) throw new Error(mErr.message);
}

/**
 * Server-side helper: returns the current user's auth record + their workspace.
 * Self-heals: if somehow the user has no membership (e.g. older session from
 * before bootstrap existed), runs ensureViewerBootstrapped on the fly.
 */
export async function getViewer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // limit(1) rather than maybeSingle() — multi-row state must not throw here
  // or we end up calling bootstrap repeatedly and creating duplicate orgs.
  const { data: memberships } = await supabase
    .from("memberships")
    .select("organization_id, role, accepted_at")
    .eq("user_id", user.id)
    .limit(1);
  let membership = memberships?.[0] ?? null;

  if (!membership) {
    await ensureViewerBootstrapped({
      id: user.id,
      email: user.email ?? "",
      displayName: (user.user_metadata?.full_name as string | undefined) ?? null,
    });
    const { data: retry } = await supabase
      .from("memberships")
      .select("organization_id, role, accepted_at")
      .eq("user_id", user.id)
      .limit(1);
    membership = retry?.[0] ?? null;
  }

  if (!membership) {
    return { user, supabase, organization: null, role: null, acceptedAt: null };
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, plan, credits_remaining")
    .eq("id", membership.organization_id)
    .maybeSingle();

  return { user, supabase, organization, role: membership.role, acceptedAt: membership.accepted_at };
}

// =========================================================
// Series / interview knowledge-base helpers
// (RLS scopes all of these to the caller's org + series access —
// pass a request-scoped client, not the service client, unless you
// intend to bypass row-level security.)
// =========================================================

/** All series visible to the current user (per `can_view_series` RLS). */
export async function getSeriesForUser(sb: SupabaseClient<Database>): Promise<Series[]> {
  const { data, error } = await sb
    .from("series")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** A single series by id, or null if not found / not visible to the caller. */
export async function getSeries(sb: SupabaseClient<Database>, id: string): Promise<Series | null> {
  const { data, error } = await sb.from("series").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export type SeriesKnowledge = {
  topics: Topic[];
  facts: Array<Fact & { entities: Entity[] }>;
  entities: Entity[];
};

/** Topics + facts (with linked entities) + entities for a series. */
export async function getSeriesKnowledge(
  sb: SupabaseClient<Database>,
  seriesId: string,
): Promise<SeriesKnowledge> {
  const [topicsRes, factsRes, entitiesRes] = await Promise.all([
    sb.from("topics").select("*").eq("series_id", seriesId).order("position", { ascending: true }),
    sb
      .from("facts")
      .select("*, fact_entities ( entities ( * ) )")
      .eq("series_id", seriesId)
      .order("created_at", { ascending: false }),
    sb.from("entities").select("*").eq("series_id", seriesId).order("name", { ascending: true }),
  ]);
  if (topicsRes.error) throw new Error(topicsRes.error.message);
  if (factsRes.error) throw new Error(factsRes.error.message);
  if (entitiesRes.error) throw new Error(entitiesRes.error.message);

  type FactWithEntities = Fact & {
    fact_entities: Array<{ entities: Entity | null }> | null;
  };

  const facts = ((factsRes.data ?? []) as unknown as FactWithEntities[]).map((f) => {
    const { fact_entities, ...rest } = f;
    const entities = (fact_entities ?? [])
      .map((fe) => fe.entities)
      .filter((e): e is Entity => e !== null);
    return { ...rest, entities };
  });

  return {
    topics: topicsRes.data ?? [],
    facts,
    entities: entitiesRes.data ?? [],
  };
}

/** A single interview by id, or null if not found / not visible to the caller. */
export async function getInterview(sb: SupabaseClient<Database>, id: string): Promise<Interview | null> {
  const { data, error } = await sb.from("interviews").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * The pipeline-written summary for one interview, or null pre-Task-12 (or
 * mid-processing, before the summary row lands) — the recap page uses null
 * as its signal to render the "still writing this up" placeholder.
 */
export async function getInterviewSummary(
  sb: SupabaseClient<Database>,
  interviewId: string,
): Promise<InterviewSummary | null> {
  const { data, error } = await sb
    .from("interview_summaries")
    .select("*")
    .eq("interview_id", interviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export type InterviewFactRow = {
  id: string;
  statement: string;
  topicName: string | null;
  audioOffsetSec: number | null;
};

/**
 * Facts saved directly from one session, oldest first — the recap page's
 * "Saved today" list. Excludes anything already superseded by a later
 * correction; pre-Task-12 this is simply empty.
 */
export async function getInterviewFacts(
  sb: SupabaseClient<Database>,
  interviewId: string,
): Promise<InterviewFactRow[]> {
  const { data, error } = await sb
    .from("facts")
    .select("id, statement, audio_offset_sec, topics ( name )")
    .eq("source_interview_id", interviewId)
    .neq("status", "superseded")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  type FactTopicRow = { id: string; statement: string; audio_offset_sec: number | null; topics: { name: string } | null };
  return ((data ?? []) as unknown as FactTopicRow[]).map((f) => ({
    id: f.id,
    statement: f.statement,
    topicName: f.topics?.name ?? null,
    audioOffsetSec: f.audio_offset_sec,
  }));
}

/**
 * Exact per-provider/per-phase API token usage rows for one interview
 * (realtime session + anthropic extract/merge), oldest first. Every number
 * here is the verbatim value the provider reported — nothing estimated.
 */
export async function getInterviewUsage(
  sb: SupabaseClient<Database>,
  interviewId: string,
): Promise<InterviewUsage[]> {
  const { data, error } = await sb
    .from("interview_usage")
    .select("*")
    .eq("interview_id", interviewId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * All transcript turns for one interview, oldest first (`seq` order) — the
 * session results page's full transcript. `interview_messages` is
 * insert-only and RLS-gated the same way as everything else here
 * (`can_view_series` via the interview's series).
 */
export async function getInterviewMessages(
  sb: SupabaseClient<Database>,
  interviewId: string,
): Promise<InterviewMessage[]> {
  const { data, error } = await sb
    .from("interview_messages")
    .select("*")
    .eq("interview_id", interviewId)
    .order("seq", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Best-effort display name for a single user id (falling back to email) —
 * used for warm, personal copy like the interviewee home's "{owner} would
 * love to hear about …" prompt. Returns null if the row isn't visible under
 * RLS or has neither a display name nor an email set.
 */
export async function getUserDisplayName(sb: SupabaseClient<Database>, userId: string): Promise<string | null> {
  const { data } = await sb.from("users").select("display_name, email").eq("id", userId).maybeSingle();
  if (!data) return null;
  return data.display_name || data.email || null;
}

export type SeriesSummary = {
  memoriesCount: number;
  sessionsCount: number;
  sessionsThisMonth: number;
  lastSessionAt: string | null;
  meanCoverage: number;
};

const emptySummary = (): SeriesSummary => ({
  memoriesCount: 0,
  sessionsCount: 0,
  sessionsThisMonth: 0,
  lastSessionAt: null,
  meanCoverage: 0,
});

/**
 * Per-series roll-ups for the home + series-list card grids and the detail
 * page head: memories saved, sessions run (+ how many this month), when the
 * last one happened, and mean coverage across the queued (non-suggested)
 * topics. Fetched in three flat queries and aggregated in JS rather than a
 * SQL view/RPC — per-workspace volume is small enough that this is simpler
 * to reason about than a migration.
 */
export async function getSeriesSummaries(
  sb: SupabaseClient<Database>,
  seriesIds: string[],
): Promise<Record<string, SeriesSummary>> {
  const summaries: Record<string, SeriesSummary> = {};
  for (const id of seriesIds) summaries[id] = emptySummary();
  if (seriesIds.length === 0) return summaries;

  const [topicsRes, factsRes, interviewsRes] = await Promise.all([
    sb.from("topics").select("series_id, coverage_score").eq("suggested", false).in("series_id", seriesIds),
    // "Memories" = facts that haven't been replaced by a newer correction —
    // needs_review/retell_queued facts still count (they're still saved
    // knowledge, just flagged); only superseded ones are excluded.
    sb.from("facts").select("series_id").neq("status", "superseded").in("series_id", seriesIds),
    sb
      .from("interviews")
      .select("series_id, started_at")
      .in("status", ["completed", "processed"])
      .in("series_id", seriesIds),
  ]);
  if (topicsRes.error) throw new Error(topicsRes.error.message);
  if (factsRes.error) throw new Error(factsRes.error.message);
  if (interviewsRes.error) throw new Error(interviewsRes.error.message);

  const coverageSums = new Map<string, { sum: number; count: number }>();
  for (const t of topicsRes.data ?? []) {
    const bucket = coverageSums.get(t.series_id) ?? { sum: 0, count: 0 };
    bucket.sum += t.coverage_score;
    bucket.count += 1;
    coverageSums.set(t.series_id, bucket);
  }
  for (const [id, bucket] of coverageSums) {
    if (summaries[id]) summaries[id].meanCoverage = bucket.count > 0 ? bucket.sum / bucket.count : 0;
  }

  for (const f of factsRes.data ?? []) {
    if (summaries[f.series_id]) summaries[f.series_id].memoriesCount += 1;
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  for (const i of interviewsRes.data ?? []) {
    const s = summaries[i.series_id];
    if (!s) continue;
    s.sessionsCount += 1;
    if (new Date(i.started_at) >= monthStart) s.sessionsThisMonth += 1;
    if (!s.lastSessionAt || new Date(i.started_at) > new Date(s.lastSessionAt)) {
      s.lastSessionAt = i.started_at;
    }
  }

  return summaries;
}

export type SessionRow = {
  id: string;
  sessionNumber: number;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  memoriesAdded: number;
  summaryShort: string | null;
  processError: string | null;
};

/**
 * Completed/processed sessions for a series' detail page — oldest→newest
 * numbered ("Session 1, 2, ...") but returned newest-first for display, each
 * joined to its short summary (once Task 14's pipeline writes one) and a
 * count of the facts it produced (excluding superseded ones).
 */
export async function listInterviewsForSeries(
  sb: SupabaseClient<Database>,
  seriesId: string,
): Promise<SessionRow[]> {
  const { data: interviews, error: interviewsErr } = await sb
    .from("interviews")
    .select("id, started_at, ended_at, duration_sec, process_error")
    .eq("series_id", seriesId)
    .in("status", ["completed", "processed"])
    .order("started_at", { ascending: true });
  if (interviewsErr) throw new Error(interviewsErr.message);
  if (!interviews || interviews.length === 0) return [];

  const ids = interviews.map((i) => i.id);
  const [summariesRes, factsRes] = await Promise.all([
    sb.from("interview_summaries").select("interview_id, short").in("interview_id", ids),
    sb.from("facts").select("source_interview_id").in("source_interview_id", ids).neq("status", "superseded"),
  ]);
  if (summariesRes.error) throw new Error(summariesRes.error.message);
  if (factsRes.error) throw new Error(factsRes.error.message);

  const summaryByInterview = new Map((summariesRes.data ?? []).map((s) => [s.interview_id, s.short] as const));
  const factCounts = new Map<string, number>();
  for (const f of factsRes.data ?? []) {
    if (!f.source_interview_id) continue;
    factCounts.set(f.source_interview_id, (factCounts.get(f.source_interview_id) ?? 0) + 1);
  }

  return interviews
    .map((i, idx) => ({
      id: i.id,
      sessionNumber: idx + 1,
      startedAt: i.started_at,
      endedAt: i.ended_at,
      durationSec: i.duration_sec,
      memoriesAdded: factCounts.get(i.id) ?? 0,
      summaryShort: summaryByInterview.get(i.id) ?? null,
      processError: i.process_error,
    }))
    .reverse();
}

export type SeriesAccessBadge = "owner" | "can_interview" | "can_view";
export type SeriesAccessRow = {
  userId: string;
  name: string;
  email: string;
  avatarPath: string | null;
  badge: SeriesAccessBadge;
};

type AccessJoinRow = {
  user_id: string;
  can_view: boolean;
  can_interview: boolean;
  users: { email: string; display_name: string | null; avatar_path: string | null } | null;
};

/**
 * "Who's involved" preview for the series detail hub. Org admins implicitly
 * have full access to every series (RLS's `is_org_admin()`), shown as
 * "owner"; everyone else's access comes from an explicit `series_access`
 * row. Task 8's access page manages the underlying rows — this just reads
 * them for display, deduping anyone already shown as an owner.
 */
export async function getSeriesAccessSummary(
  sb: SupabaseClient<Database>,
  seriesId: string,
): Promise<SeriesAccessRow[]> {
  const [members, accessRes] = await Promise.all([
    listMembers(sb),
    sb
      .from("series_access")
      .select("user_id, can_view, can_interview, users ( email, display_name, avatar_path )")
      .eq("series_id", seriesId),
  ]);
  if (accessRes.error) throw new Error(accessRes.error.message);

  const rows: SeriesAccessRow[] = [];
  const seen = new Set<string>();

  for (const m of members) {
    if (m.role !== "admin") continue;
    const name = m.users?.display_name || m.users?.email || "Unknown";
    rows.push({
      userId: m.user_id,
      name,
      email: m.users?.email ?? "",
      avatarPath: m.users?.avatar_path ?? null,
      badge: "owner",
    });
    seen.add(m.user_id);
  }

  for (const a of (accessRes.data ?? []) as unknown as AccessJoinRow[]) {
    if (seen.has(a.user_id)) continue;
    if (!a.can_view && !a.can_interview) continue;
    const name = a.users?.display_name || a.users?.email || "Unknown";
    rows.push({
      userId: a.user_id,
      name,
      email: a.users?.email ?? "",
      avatarPath: a.users?.avatar_path ?? null,
      badge: a.can_interview ? "can_interview" : "can_view",
    });
    seen.add(a.user_id);
  }

  return rows;
}

export type MemberRow = Membership & {
  users: { email: string; display_name: string | null; avatar_path: string | null } | null;
};

/**
 * Members of the current workspace, joined with their `users` row. Safe to
 * call with a request-scoped (RLS-bound) client — 0006_members_rls.sql added
 * "org members read" / "org users read" SELECT policies scoped to
 * `organization_id = current_org_id()`, so any org member sees the full
 * roster, not just their own row.
 */
export async function listMembers(sb: SupabaseClient<Database>): Promise<MemberRow[]> {
  const { data, error } = await sb
    .from("memberships")
    .select("*, users ( email, display_name, avatar_path )")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MemberRow[];
}

// =========================================================
// Memories review (Task 15)
// =========================================================

/**
 * Series a user is the *subject* of — the interviewee's own memories page
 * (mockup #1f) aggregates across all of these (usually just one) rather than
 * being scoped to a single series in the URL. RLS-scoped: `can_view_series`
 * already grants a subject visibility into their own series, so a plain
 * request-scoped client is enough here.
 */
export async function getSubjectSeries(sb: SupabaseClient<Database>, userId: string): Promise<Series[]> {
  const { data, error } = await sb
    .from("series")
    .select("*")
    .eq("subject_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type MemoryRow = {
  id: string;
  statement: string;
  status: FactStatus;
  createdAt: string;
  seriesId: string;
  seriesTitle: string;
  topicName: string | null;
  hasPerson: boolean;
  hasPlace: boolean;
};

type MemoryJoinRow = {
  id: string;
  statement: string;
  status: FactStatus;
  created_at: string;
  series_id: string;
  topics: { name: string } | null;
  series: { title: string } | null;
  fact_entities: Array<{ entities: { kind: EntityKind } | null }> | null;
};

/**
 * The memories list's rows for a set of series, newest first — excludes
 * superseded facts the same way every other knowledge-base read does.
 * `hasPerson`/`hasPlace` power the People/Places filter pills (a fact
 * "belongs" to a filter if any of its linked entities is that kind).
 */
export async function getMemoriesForSeries(
  sb: SupabaseClient<Database>,
  seriesIds: string[],
): Promise<MemoryRow[]> {
  if (seriesIds.length === 0) return [];

  const { data, error } = await sb
    .from("facts")
    .select(
      "id, statement, status, created_at, series_id, topics ( name ), series ( title ), fact_entities ( entities ( kind ) )",
    )
    .in("series_id", seriesIds)
    .neq("status", "superseded")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as MemoryJoinRow[]).map((f) => {
    const kinds = new Set((f.fact_entities ?? []).map((fe) => fe.entities?.kind).filter(Boolean));
    return {
      id: f.id,
      statement: f.statement,
      status: f.status,
      createdAt: f.created_at,
      seriesId: f.series_id,
      seriesTitle: f.series?.title ?? "",
      topicName: f.topics?.name ?? null,
      hasPerson: kinds.has("person"),
      hasPlace: kinds.has("place"),
    };
  });
}

export type FactDetail = {
  id: string;
  statement: string;
  status: FactStatus;
  seriesId: string;
  seriesTitle: string;
  topicName: string | null;
  sourceInterviewId: string | null;
  audioPath: string | null;
  audioOffsetSec: number | null;
};

type FactDetailJoinRow = {
  id: string;
  statement: string;
  status: FactStatus;
  series_id: string;
  source_interview_id: string | null;
  audio_offset_sec: number | null;
  topics: { name: string } | null;
  series: { title: string } | null;
  interviews: { audio_path: string | null } | null;
};

/**
 * A single fact for the review-detail page (mockup #1g), joined to its
 * topic name, series title, and source interview's `audio_path` (needed to
 * decide whether to render the audio player at all). RLS-scoped via
 * `can_view_series` — same visibility rule as everything else in this file
 * — so this returns null for a fact the caller can't see, which the page
 * treats as `notFound()` rather than distinguishing "doesn't exist" from
 * "not yours to see".
 */
export async function getFactDetail(sb: SupabaseClient<Database>, factId: string): Promise<FactDetail | null> {
  const { data, error } = await sb
    .from("facts")
    .select(
      "id, statement, status, series_id, source_interview_id, audio_offset_sec, topics ( name ), series ( title ), interviews ( audio_path )",
    )
    .eq("id", factId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const f = data as unknown as FactDetailJoinRow;
  return {
    id: f.id,
    statement: f.statement,
    status: f.status,
    seriesId: f.series_id,
    seriesTitle: f.series?.title ?? "",
    topicName: f.topics?.name ?? null,
    sourceInterviewId: f.source_interview_id,
    audioPath: f.interviews?.audio_path ?? null,
    audioOffsetSec: f.audio_offset_sec,
  };
}
