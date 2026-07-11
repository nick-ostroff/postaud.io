import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/db/server";
import { serviceClient } from "@/db/service";
import type { Database, Entity, Fact, Interview, Membership, Series, Topic } from "@/db/types";

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

export type MemberRow = Membership & { users: { email: string; display_name: string | null } | null };

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
    .select("*, users ( email, display_name )")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MemberRow[];
}
