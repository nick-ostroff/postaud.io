import "server-only";
import { serviceClient } from "@/db/service";
import type { MemberRole, OrgPlan, SubjectKind } from "@/db/types";
import { daysSince } from "@/lib/time";
import { STALE_AFTER_DAYS } from "@/server/series/staleness";

// Operator console thresholds (spec §7.5 / task-17 brief).
const DORMANT_DAYS = 42; // account-level: no interview in this many days -> "dormant"
// Series-level "going stale" threshold reuses the owner-facing helper's
// constant (src/server/series/staleness.ts) so operator and owner views
// always agree on when a series is stale. Only the constant is shared —
// the console renders its own label copy ("going stale" / "Stale — …").

export type OrgListRow = {
  id: string;
  name: string;
  plan: string;
  status: "active" | "suspended";
  credits_remaining: number;
  created_at: string;
  owner_email: string | null;
};

export async function listOrganizations(opts: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<OrgListRow[]> {
  const svc = serviceClient();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  // When searching, bypass pagination and fetch a wider window so the
  // in-memory OR filter across name + email has a full candidate set.
  const searching = Boolean(opts.search);
  const fetchLimit = searching ? 500 : limit;
  const fetchOffset = searching ? 0 : offset;

  // Pull orgs + admin email in one round trip. We fetch a bit wide and
  // filter in memory on search — the scale here is "platform admin looking
  // at the customer list," not a hot path.
  let query = svc
    .from("organizations")
    .select(`
      id,
      name,
      plan,
      status,
      credits_remaining,
      created_at,
      memberships!inner ( role, users ( email ) )
    `)
    .eq("memberships.role", "admin")
    .order("created_at", { ascending: false })
    .range(fetchOffset, fetchOffset + fetchLimit - 1);

  if (opts.search) {
    // Supabase doesn't easily OR across joined-table columns; apply name
    // search server-side and email search in memory.
    query = query.ilike("name", `%${opts.search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows: OrgListRow[] = (data ?? []).map((row) => {
    const memberships = row.memberships as unknown as Array<{ role: string; users: { email?: string } | null }> | { role: string; users: { email?: string } | null };
    const admin = Array.isArray(memberships) ? memberships[0] : memberships;
    const ownerEmail = admin?.users?.email ?? null;
    return {
      id: row.id,
      name: row.name,
      plan: row.plan,
      status: row.status as "active" | "suspended",
      credits_remaining: row.credits_remaining,
      created_at: row.created_at,
      owner_email: ownerEmail,
    };
  });

  if (opts.search) {
    const q = opts.search.toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || (r.owner_email?.toLowerCase().includes(q) ?? false),
    );
  }
  return rows;
}

export type ActivityStatus = "active" | "dormant" | "invited";

// "Person" and "Self" are shown to the operator as-is; a `person`-kind
// subject with no linked user account renders as "No-account" so the
// operator can see who's being interviewed without a login existing.
export type SubjectDisplay = "Person" | "Self" | "Organization" | "No-account";

function subjectDisplay(kind: SubjectKind, subjectUserId: string | null): SubjectDisplay {
  if (kind === "self") return "Self";
  if (kind === "organization") return "Organization";
  if (kind === "member") return "Person";
  // kind === "person"
  return subjectUserId ? "Person" : "No-account";
}

export type OrgDetail = {
  organization: {
    id: string;
    name: string;
    plan: string;
    status: "active" | "suspended";
    credits_remaining: number;
    stripe_customer_id: string | null;
    created_at: string;
  };
  members: Array<{ user_id: string; email: string; role: string; created_at: string }>;
  auditLog: Array<{
    id: number;
    at: string;
    action: string;
    actor_email: string | null;
    actor_user_id: string | null;
    meta: unknown;
  }>;
  // --- operator console additions (metadata only — see spec §7.5) ---
  ownerEmail: string | null;
  activityStatus: ActivityStatus;
  lastActivity: string | null;
  usage: {
    storageBytes: number | null; // null = storage listing unavailable, best-effort
    interviewsThisMonth: number;
    factsCount: number;
    seriesCount: number;
  };
  seriesRows: Array<{
    id: string;
    title: string;
    subjectDisplay: SubjectDisplay;
    subjectName: string;
    sessions: number;
    facts: number;
    lastActivity: string | null;
    stale: boolean;
  }>;
  network: {
    members: Array<{
      userId: string;
      email: string;
      role: string;
      accepted: boolean;
      subjectOf: string[]; // series titles this member is the subject of
    }>;
    subjectsWithoutAccount: Array<{ seriesId: string; title: string; subjectName: string }>;
  };
};

async function getOrgStorageBytes(orgId: string): Promise<number | null> {
  // Best-effort: the interview-audio bucket may not exist in every
  // environment, and storage isn't wired for local/test runs. Never let a
  // storage failure break the admin page.
  try {
    const svc = serviceClient();
    const { data, error } = await svc.storage.from("interview-audio").list(orgId, { limit: 1000 });
    if (error || !data) return null;
    return data.reduce((sum, f) => sum + (f.metadata?.size ?? 0), 0);
  } catch {
    return null;
  }
}

export async function getOrganizationDetail(orgId: string): Promise<OrgDetail | null> {
  const svc = serviceClient();

  const { data: org, error: orgErr } = await svc
    .from("organizations")
    .select("id, name, plan, status, credits_remaining, stripe_customer_id, created_at")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr) throw new Error(orgErr.message);
  if (!org) return null;

  const [{ data: members }, { data: audit }, { data: seriesRaw }, storageBytes] = await Promise.all([
    svc
      .from("memberships")
      .select("user_id, role, created_at, accepted_at, users ( email )")
      .eq("organization_id", orgId),
    // audit_logs for this org: either action targeted it, or actor was a member.
    // action + at only are ever rendered — meta is fetched but not surfaced
    // in the UI to keep the "metadata only" invariant simple to audit.
    svc
      .from("audit_logs")
      .select("id, at, action, actor_email, actor_user_id, meta, target_id, organization_id")
      .or(`organization_id.eq.${orgId},target_id.eq.${orgId}`)
      .order("at", { ascending: false })
      .limit(25),
    svc
      .from("series")
      .select("id, title, subject_kind, subject_user_id, subject_name, created_at")
      .eq("organization_id", orgId),
    getOrgStorageBytes(orgId),
  ]);

  const seriesIds = (seriesRaw ?? []).map((s) => s.id);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [{ count: interviewsThisMonth }, { data: interviewRows }, { data: factRows }] = await Promise.all([
    svc
      .from("interviews")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("started_at", monthStart),
    seriesIds.length
      ? svc.from("interviews").select("series_id, started_at").in("series_id", seriesIds)
      : Promise.resolve({ data: [] as Array<{ series_id: string; started_at: string }> }),
    // Counting only — never select `statement`.
    seriesIds.length
      ? svc.from("facts").select("id, series_id").in("series_id", seriesIds)
      : Promise.resolve({ data: [] as Array<{ id: string; series_id: string }> }),
  ]);

  const sessionsBySeries = new Map<string, number>();
  const lastActivityBySeries = new Map<string, string>();
  for (const row of interviewRows ?? []) {
    sessionsBySeries.set(row.series_id, (sessionsBySeries.get(row.series_id) ?? 0) + 1);
    const prev = lastActivityBySeries.get(row.series_id);
    if (!prev || new Date(row.started_at) > new Date(prev)) {
      lastActivityBySeries.set(row.series_id, row.started_at);
    }
  }

  const factsBySeries = new Map<string, number>();
  for (const row of factRows ?? []) {
    factsBySeries.set(row.series_id, (factsBySeries.get(row.series_id) ?? 0) + 1);
  }

  const subjectOfBySeriesUser = new Map<string, string[]>();
  const seriesRows: OrgDetail["seriesRows"] = (seriesRaw ?? []).map((s) => {
    const lastActivity = lastActivityBySeries.get(s.id) ?? null;
    const reference = lastActivity ?? s.created_at;
    const stale = daysSince(reference) > STALE_AFTER_DAYS;
    if (s.subject_user_id) {
      const list = subjectOfBySeriesUser.get(s.subject_user_id) ?? [];
      list.push(s.title);
      subjectOfBySeriesUser.set(s.subject_user_id, list);
    }
    return {
      id: s.id,
      title: s.title,
      subjectDisplay: subjectDisplay(s.subject_kind, s.subject_user_id),
      subjectName: s.subject_name,
      sessions: sessionsBySeries.get(s.id) ?? 0,
      facts: factsBySeries.get(s.id) ?? 0,
      lastActivity,
      stale,
    };
  });

  const factsCount = seriesRows.reduce((sum, s) => sum + s.facts, 0);

  const memberRows = (members ?? []).map((m) => ({
    user_id: m.user_id,
    email: (m.users as { email?: string } | null)?.email ?? "",
    role: m.role,
    created_at: m.created_at,
    accepted_at: m.accepted_at as string | null,
  }));

  const owner = [...memberRows]
    .filter((m) => m.role === "admin")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
  const ownerAccepted = owner ? owner.accepted_at !== null : true;

  const orgLastActivity =
    seriesRows.reduce<string | null>((latest, s) => {
      if (!s.lastActivity) return latest;
      if (!latest || new Date(s.lastActivity) > new Date(latest)) return s.lastActivity;
      return latest;
    }, null) ?? null;

  let activityStatus: ActivityStatus;
  if (!ownerAccepted) {
    activityStatus = "invited";
  } else {
    const reference = orgLastActivity ?? org.created_at;
    activityStatus = daysSince(reference) > DORMANT_DAYS ? "dormant" : "active";
  }

  return {
    organization: {
      ...org,
      status: org.status as "active" | "suspended",
    },
    members: memberRows.map((m) => ({
      user_id: m.user_id,
      email: m.email,
      role: m.role,
      created_at: m.created_at,
    })),
    auditLog: (audit ?? []).map((a) => ({
      id: a.id,
      at: a.at,
      action: a.action,
      actor_email: a.actor_email,
      actor_user_id: a.actor_user_id,
      meta: a.meta,
    })),
    ownerEmail: owner?.email || null,
    activityStatus,
    lastActivity: orgLastActivity,
    usage: {
      storageBytes,
      interviewsThisMonth: interviewsThisMonth ?? 0,
      factsCount,
      seriesCount: seriesRows.length,
    },
    seriesRows,
    network: {
      // Exclude the owner (see above) — the panel caption reads "Who
      // {owner} has brought onto the platform," so the owner isn't a
      // member of their own network.
      members: memberRows
        .filter((m) => m.user_id !== owner?.user_id)
        .map((m) => ({
          userId: m.user_id,
          email: m.email,
          role: m.role,
          accepted: m.accepted_at !== null,
          subjectOf: subjectOfBySeriesUser.get(m.user_id) ?? [],
        })),
      subjectsWithoutAccount: seriesRows
        .filter((s) => s.subjectDisplay === "No-account")
        .map((s) => ({ seriesId: s.id, title: s.title, subjectName: s.subjectName })),
    },
  };
}

export async function adjustOrgCredits(args: {
  orgId: string;
  delta: number;
  reason: string;
  actorEmail: string;
}): Promise<void> {
  // Not transactional: audit log may drift from state if the insert fails.
  // Acceptable at platform-admin scale; revisit if this grows beyond ~2 admins.
  const svc = serviceClient();

  const { data: org, error: fetchErr } = await svc
    .from("organizations")
    .select("credits_remaining")
    .eq("id", args.orgId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!org) throw new Error("Organization not found");

  const before = org.credits_remaining;
  const after = before + args.delta;

  const { error: updErr } = await svc
    .from("organizations")
    .update({ credits_remaining: after })
    .eq("id", args.orgId);
  if (updErr) throw new Error(updErr.message);

  const { error: auditErr } = await svc.from("audit_logs").insert({
    organization_id: args.orgId,
    target_type: "organization",
    target_id: args.orgId,
    action: "credit_adjustment",
    actor_email: args.actorEmail,
    meta: { delta: args.delta, reason: args.reason, before, after },
  });
  if (auditErr) throw new Error(auditErr.message);
}

export async function setOrgStatus(args: {
  orgId: string;
  status: "active" | "suspended";
  actorEmail: string;
}): Promise<void> {
  // Not transactional: audit log may drift from state if the insert fails.
  // Acceptable at platform-admin scale; revisit if this grows beyond ~2 admins.
  const svc = serviceClient();

  const { data: org, error: fetchErr } = await svc
    .from("organizations")
    .select("status")
    .eq("id", args.orgId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!org) throw new Error("Organization not found");

  const before = org.status;

  const { error: updErr } = await svc
    .from("organizations")
    .update({ status: args.status })
    .eq("id", args.orgId);
  if (updErr) throw new Error(updErr.message);

  const { error: auditErr } = await svc.from("audit_logs").insert({
    organization_id: args.orgId,
    target_type: "organization",
    target_id: args.orgId,
    action: args.status === "suspended" ? "account_suspended" : "account_unsuspended",
    actor_email: args.actorEmail,
    meta: { before, after: args.status },
  });
  if (auditErr) throw new Error(auditErr.message);
}

// =========================================================================
// Operator console — platform-wide growth stats, users/accounts list,
// series registry. Every query here is metadata only: counts, titles,
// names, statuses. Never facts.statement, interview_messages.text,
// interview_summaries.short/long/bullets, or topics content.
// =========================================================================

export type PlatformStats = {
  totalUsers: number;
  activeSeries: number;
  interviewsThisWeek: number;
  totalFacts: number;
};

export async function getPlatformStats(): Promise<PlatformStats> {
  const svc = serviceClient();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [users, activeSeries, interviewsThisWeek, facts] = await Promise.all([
    svc.from("users").select("id", { count: "exact", head: true }),
    svc.from("series").select("id", { count: "exact", head: true }).eq("status", "active"),
    svc.from("interviews").select("id", { count: "exact", head: true }).gte("started_at", weekAgo),
    svc.from("facts").select("id", { count: "exact", head: true }),
  ]);

  return {
    totalUsers: users.count ?? 0,
    activeSeries: activeSeries.count ?? 0,
    interviewsThisWeek: interviewsThisWeek.count ?? 0,
    totalFacts: facts.count ?? 0,
  };
}

export type AccountConsoleRow = {
  id: string;
  name: string;
  plan: OrgPlan;
  credits_remaining: number;
  created_at: string;
  owner_email: string | null;
  activity_status: ActivityStatus;
  series_count: number;
  member_count: number;
  invited_count: number;
  subjects_without_account: number;
  last_activity: string | null;
};

export async function listAccountsConsole(opts: {
  search?: string;
  status?: "all" | ActivityStatus;
  limit?: number;
  offset?: number;
}): Promise<{ rows: AccountConsoleRow[]; total: number }> {
  const svc = serviceClient();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const status = opts.status ?? "all";
  const search = opts.search?.trim().toLowerCase();

  // Status and owner-email search can't be expressed as a single SQL filter
  // against the joined tables, so we pull a wide window and compute in
  // memory. Fine at platform-admin scale (not a hot path).
  const { data: orgs, error: orgErr } = await svc
    .from("organizations")
    .select("id, name, plan, credits_remaining, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (orgErr) throw new Error(orgErr.message);

  const orgIds = (orgs ?? []).map((o) => o.id);
  if (orgIds.length === 0) return { rows: [], total: 0 };

  const [{ data: memberships }, { data: seriesRows }, { data: interviewRows }] = await Promise.all([
    svc
      .from("memberships")
      .select("organization_id, user_id, role, created_at, accepted_at, users ( email )")
      .in("organization_id", orgIds),
    svc.from("series").select("id, organization_id, subject_kind, subject_user_id").in("organization_id", orgIds),
    svc
      .from("interviews")
      .select("organization_id, started_at")
      .in("organization_id", orgIds)
      .order("started_at", { ascending: false }),
  ]);

  const membershipsByOrg = new Map<string, NonNullable<typeof memberships>>();
  for (const m of memberships ?? []) {
    const list = membershipsByOrg.get(m.organization_id) ?? [];
    list.push(m);
    membershipsByOrg.set(m.organization_id, list);
  }

  const seriesByOrg = new Map<string, { count: number; noAccount: number }>();
  for (const s of seriesRows ?? []) {
    const entry = seriesByOrg.get(s.organization_id) ?? { count: 0, noAccount: 0 };
    entry.count += 1;
    if (s.subject_kind === "person" && !s.subject_user_id) entry.noAccount += 1;
    seriesByOrg.set(s.organization_id, entry);
  }

  const lastActivityByOrg = new Map<string, string>();
  for (const iv of interviewRows ?? []) {
    // Pre-sorted desc, so the first hit per org is already the max.
    if (!lastActivityByOrg.has(iv.organization_id)) {
      lastActivityByOrg.set(iv.organization_id, iv.started_at);
    }
  }

  const rows: AccountConsoleRow[] = (orgs ?? []).map((org) => {
    const orgMembers = membershipsByOrg.get(org.id) ?? [];
    const owner = [...orgMembers]
      .filter((m) => m.role === "admin")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
    const ownerAccepted = owner ? owner.accepted_at !== null : true;
    const ownerEmail = (owner?.users as { email?: string } | null)?.email ?? null;

    const memberCount = orgMembers.length;
    const invitedCount = owner ? Math.max(0, memberCount - 1) : memberCount;

    const seriesInfo = seriesByOrg.get(org.id) ?? { count: 0, noAccount: 0 };
    const lastActivity = lastActivityByOrg.get(org.id) ?? null;

    let activityStatus: ActivityStatus;
    if (!ownerAccepted) {
      activityStatus = "invited";
    } else {
      const reference = lastActivity ?? org.created_at;
      activityStatus = daysSince(reference) > DORMANT_DAYS ? "dormant" : "active";
    }

    return {
      id: org.id,
      name: org.name,
      plan: org.plan,
      credits_remaining: org.credits_remaining,
      created_at: org.created_at,
      owner_email: ownerEmail,
      activity_status: activityStatus,
      series_count: seriesInfo.count,
      member_count: memberCount,
      invited_count: invitedCount,
      subjects_without_account: seriesInfo.noAccount,
      last_activity: lastActivity,
    };
  });

  let filtered = rows;
  if (status !== "all") {
    filtered = filtered.filter((r) => r.activity_status === status);
  }
  if (search) {
    filtered = filtered.filter(
      (r) => r.name.toLowerCase().includes(search) || (r.owner_email?.toLowerCase().includes(search) ?? false),
    );
  }

  filtered.sort((a, b) => {
    if (!a.last_activity && !b.last_activity) return 0;
    if (!a.last_activity) return 1;
    if (!b.last_activity) return -1;
    return new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime();
  });

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);
  return { rows: page, total };
}

export type SeriesRegistryRow = {
  id: string;
  title: string;
  organizationId: string;
  organizationName: string;
  subjectDisplay: SubjectDisplay;
  sessions: number;
  facts: number;
  membersWithAccess: number;
  lastActivity: string | null;
  stale: boolean;
};

export async function listSeriesRegistry(opts: {
  search?: string;
  subjectType?: "all" | "person" | "self" | "organization" | "no_account";
  limit?: number;
  offset?: number;
}): Promise<{ rows: SeriesRegistryRow[]; total: number }> {
  const svc = serviceClient();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const subjectType = opts.subjectType ?? "all";
  const search = opts.search?.trim().toLowerCase();

  let query = svc
    .from("series")
    .select("id, title, subject_kind, subject_user_id, organization_id, created_at, organizations ( name )")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (subjectType === "self") {
    query = query.eq("subject_kind", "self");
  } else if (subjectType === "organization") {
    query = query.eq("subject_kind", "organization");
  } else if (subjectType === "no_account") {
    query = query.eq("subject_kind", "person").is("subject_user_id", null);
  } else if (subjectType === "person") {
    query = query.in("subject_kind", ["person", "member"]).not("subject_user_id", "is", null);
  }

  const { data: seriesRaw, error: seriesErr } = await query;
  if (seriesErr) throw new Error(seriesErr.message);

  const seriesIds = (seriesRaw ?? []).map((s) => s.id);
  if (seriesIds.length === 0) return { rows: [], total: 0 };

  const [{ data: interviewRows }, { data: factRows }, { data: accessRows }] = await Promise.all([
    svc.from("interviews").select("series_id, started_at").in("series_id", seriesIds),
    // Counting only — never select `statement`.
    svc.from("facts").select("id, series_id").in("series_id", seriesIds),
    svc.from("series_access").select("series_id, user_id").in("series_id", seriesIds),
  ]);

  const sessionsBySeries = new Map<string, number>();
  const lastActivityBySeries = new Map<string, string>();
  for (const row of interviewRows ?? []) {
    sessionsBySeries.set(row.series_id, (sessionsBySeries.get(row.series_id) ?? 0) + 1);
    const prev = lastActivityBySeries.get(row.series_id);
    if (!prev || new Date(row.started_at) > new Date(prev)) {
      lastActivityBySeries.set(row.series_id, row.started_at);
    }
  }

  const factsBySeries = new Map<string, number>();
  for (const row of factRows ?? []) {
    factsBySeries.set(row.series_id, (factsBySeries.get(row.series_id) ?? 0) + 1);
  }

  const accessBySeries = new Map<string, number>();
  for (const row of accessRows ?? []) {
    accessBySeries.set(row.series_id, (accessBySeries.get(row.series_id) ?? 0) + 1);
  }

  let rows: SeriesRegistryRow[] = (seriesRaw ?? []).map((s) => {
    const lastActivity = lastActivityBySeries.get(s.id) ?? null;
    const reference = lastActivity ?? s.created_at;
    return {
      id: s.id,
      title: s.title,
      organizationId: s.organization_id,
      organizationName: (s.organizations as { name?: string } | null)?.name ?? "—",
      subjectDisplay: subjectDisplay(s.subject_kind, s.subject_user_id),
      sessions: sessionsBySeries.get(s.id) ?? 0,
      facts: factsBySeries.get(s.id) ?? 0,
      membersWithAccess: accessBySeries.get(s.id) ?? 0,
      lastActivity,
      stale: daysSince(reference) > STALE_AFTER_DAYS,
    };
  });

  if (search) {
    rows = rows.filter(
      (r) => r.title.toLowerCase().includes(search) || r.organizationName.toLowerCase().includes(search),
    );
  }

  rows.sort((a, b) => {
    if (!a.lastActivity && !b.lastActivity) return 0;
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
  });

  const total = rows.length;
  const page = rows.slice(offset, offset + limit);
  return { rows: page, total };
}

// =========================================================================
// Platform users — every person on the platform, not just account owners.
// Metadata only (see the invariant note above): emails, names, roles, counts.
// =========================================================================

export type PlatformUserOrg = { id: string; name: string; role: MemberRole; accepted: boolean };

export type PlatformUserRow = {
  id: string;
  email: string;
  displayName: string | null;
  orgs: PlatformUserOrg[];
  subjectOfCount: number;
  lastActivity: string | null;
  createdAt: string;
  factsCount: number; // facts across series this user created
  seriesCount: number; // series this user created
  network: { invited: number; assignees: number; subjects: number };
};

export async function listPlatformUsers(opts: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: PlatformUserRow[]; total: number }> {
  const svc = serviceClient();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const search = opts.search?.trim().toLowerCase();

  // Six flat reads joined in memory, mirroring listAccountsConsole. This is a
  // platform-admin page, not a hot path — consistency with the neighboring
  // query beats a SQL-side optimization here.
  const [
    { data: users },
    { data: memberships },
    { data: series },
    { data: interviews },
    { data: seriesAccess },
    { data: facts },
  ] = await Promise.all([
    svc.from("users").select("id, email, display_name, created_at").limit(2000),
    svc
      .from("memberships")
      .select("user_id, organization_id, role, created_at, accepted_at, organizations ( name )"),
    svc.from("series").select("id, title, subject_user_id, created_by"),
    svc.from("interviews").select("organization_id, started_at").order("started_at", { ascending: false }),
    svc.from("series_access").select("series_id, user_id"),
    // Counting only — never select `statement`.
    svc.from("facts").select("id, series_id"),
  ]);

  const orgsByUser = new Map<string, PlatformUserOrg[]>();
  const orgIdsByUser = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    const list = orgsByUser.get(m.user_id) ?? [];
    list.push({
      id: m.organization_id,
      name: (m.organizations as { name?: string } | null)?.name ?? "—",
      role: m.role as MemberRole,
      accepted: m.accepted_at !== null,
    });
    orgsByUser.set(m.user_id, list);

    const ids = orgIdsByUser.get(m.user_id) ?? [];
    ids.push(m.organization_id);
    orgIdsByUser.set(m.user_id, ids);
  }

  const subjectCountByUser = new Map<string, number>();
  for (const s of series ?? []) {
    if (!s.subject_user_id) continue;
    subjectCountByUser.set(s.subject_user_id, (subjectCountByUser.get(s.subject_user_id) ?? 0) + 1);
  }

  // Pre-sorted desc, so the first hit per org is already the max.
  const lastActivityByOrg = new Map<string, string>();
  for (const iv of interviews ?? []) {
    if (!lastActivityByOrg.has(iv.organization_id)) {
      lastActivityByOrg.set(iv.organization_id, iv.started_at);
    }
  }

  // --- network + factsCount: series this user created, who they invited ---

  // Every org's earliest-created admin membership is that org's owner.
  const membershipsByOrg = new Map<string, NonNullable<typeof memberships>>();
  for (const m of memberships ?? []) {
    const list = membershipsByOrg.get(m.organization_id) ?? [];
    list.push(m);
    membershipsByOrg.set(m.organization_id, list);
  }
  const ownerByOrg = new Map<string, string>(); // organization_id -> owning user_id
  for (const [orgId, orgMembers] of membershipsByOrg) {
    const owner = [...orgMembers]
      .filter((m) => m.role === "admin")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
    if (owner) ownerByOrg.set(orgId, owner.user_id);
  }

  const seriesCreatedByUser = new Map<string, string[]>(); // user_id -> series ids they created
  const subjectsByCreator = new Map<string, Set<string>>();
  for (const s of series ?? []) {
    if (!s.created_by) continue;
    const ids = seriesCreatedByUser.get(s.created_by) ?? [];
    ids.push(s.id);
    seriesCreatedByUser.set(s.created_by, ids);

    if (s.subject_user_id && s.subject_user_id !== s.created_by) {
      const subjects = subjectsByCreator.get(s.created_by) ?? new Set<string>();
      subjects.add(s.subject_user_id);
      subjectsByCreator.set(s.created_by, subjects);
    }
  }

  const accessBySeries = new Map<string, Set<string>>();
  for (const a of seriesAccess ?? []) {
    const set = accessBySeries.get(a.series_id) ?? new Set<string>();
    set.add(a.user_id);
    accessBySeries.set(a.series_id, set);
  }

  const factsBySeries = new Map<string, number>();
  for (const f of facts ?? []) {
    factsBySeries.set(f.series_id, (factsBySeries.get(f.series_id) ?? 0) + 1);
  }

  function invitedCount(userId: string): number {
    let count = 0;
    for (const [orgId, ownerId] of ownerByOrg) {
      if (ownerId !== userId) continue;
      count += (membershipsByOrg.get(orgId) ?? []).filter((m) => m.user_id !== userId).length;
    }
    return count;
  }

  function assigneesCount(userId: string): number {
    const seriesIds = seriesCreatedByUser.get(userId) ?? [];
    const assignees = new Set<string>();
    for (const sid of seriesIds) {
      for (const uid of accessBySeries.get(sid) ?? []) {
        if (uid !== userId) assignees.add(uid);
      }
    }
    return assignees.size;
  }

  function factsCountFor(userId: string): number {
    const seriesIds = seriesCreatedByUser.get(userId) ?? [];
    return seriesIds.reduce((sum, sid) => sum + (factsBySeries.get(sid) ?? 0), 0);
  }

  let rows: PlatformUserRow[] = (users ?? []).map((u) => {
    const orgIds = orgIdsByUser.get(u.id) ?? [];
    const lastActivity = orgIds.reduce<string | null>((latest, orgId) => {
      const at = lastActivityByOrg.get(orgId);
      if (!at) return latest;
      if (!latest || new Date(at) > new Date(latest)) return at;
      return latest;
    }, null);

    return {
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      orgs: orgsByUser.get(u.id) ?? [],
      subjectOfCount: subjectCountByUser.get(u.id) ?? 0,
      lastActivity,
      createdAt: u.created_at,
      factsCount: factsCountFor(u.id),
      seriesCount: (seriesCreatedByUser.get(u.id) ?? []).length,
      network: {
        invited: invitedCount(u.id),
        assignees: assigneesCount(u.id),
        subjects: subjectsByCreator.get(u.id)?.size ?? 0,
      },
    };
  });

  if (search) {
    rows = rows.filter(
      (r) => r.email.toLowerCase().includes(search) || (r.displayName?.toLowerCase().includes(search) ?? false),
    );
  }

  rows.sort((a, b) => {
    if (!a.lastActivity && !b.lastActivity) return 0;
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
  });

  const total = rows.length;
  return { rows: rows.slice(offset, offset + limit), total };
}

export type PlatformUserDetail = {
  user: { id: string; email: string; displayName: string | null; createdAt: string };
  orgs: PlatformUserOrg[];
  seriesOwned: Array<{ id: string; title: string; organizationId: string }>;
  seriesSubjectOf: Array<{ id: string; title: string; organizationId: string }>;
  // Series this user created, ranked by real fact counts (highest first),
  // capped to 5 — feeds the dashboard slide-in panel's "Top series" list.
  topSeries: Array<{ id: string; title: string; facts: number }>;
  interviewCount: number;
  factCount: number;
  auditLog: Array<{ id: number; at: string; action: string; actorEmail: string | null }>;
};

export async function getPlatformUserDetail(userId: string): Promise<PlatformUserDetail | null> {
  const svc = serviceClient();

  const { data: user } = await svc
    .from("users")
    .select("id, email, display_name, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (!user) return null;

  const [{ data: memberships }, { data: series }, { count: interviewCount }, { data: audit }] = await Promise.all([
    svc
      .from("memberships")
      .select("organization_id, role, accepted_at, organizations ( name )")
      .eq("user_id", userId),
    // Titles only — never transcript or fact content.
    svc
      .from("series")
      .select("id, title, organization_id, created_by, subject_user_id")
      .or(`created_by.eq.${userId},subject_user_id.eq.${userId}`),
    // `conducted_by` is the interviews table's per-user column (0001_init.sql).
    svc.from("interviews").select("id", { count: "exact", head: true }).eq("conducted_by", userId),
    svc
      .from("audit_logs")
      .select("id, at, action, actor_email")
      .or(`actor_user_id.eq.${userId},target_id.eq.${userId}`)
      .order("at", { ascending: false })
      .limit(25),
  ]);

  const seriesIds = (series ?? []).map((s) => s.id);
  // Row-level fetch (not head-count): one query gives both the total
  // factCount (across owned + subject-of series) AND a per-series
  // breakdown for topSeries below, without a second round trip.
  // Counting only — never select `statement`.
  const { data: factRows } = seriesIds.length
    ? await svc.from("facts").select("id, series_id").in("series_id", seriesIds)
    : { data: [] as Array<{ id: string; series_id: string }> };

  const factsBySeries = new Map<string, number>();
  for (const f of factRows ?? []) {
    factsBySeries.set(f.series_id, (factsBySeries.get(f.series_id) ?? 0) + 1);
  }
  const factCount = (factRows ?? []).length;

  const seriesOwned = (series ?? [])
    .filter((s) => s.created_by === userId)
    .map((s) => ({ id: s.id, title: s.title, organizationId: s.organization_id }));

  const topSeries = seriesOwned
    .map((s) => ({ id: s.id, title: s.title, facts: factsBySeries.get(s.id) ?? 0 }))
    .sort((a, b) => b.facts - a.facts)
    .slice(0, 5);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at,
    },
    orgs: (memberships ?? []).map((m) => ({
      id: m.organization_id,
      name: (m.organizations as { name?: string } | null)?.name ?? "—",
      role: m.role as MemberRole,
      accepted: m.accepted_at !== null,
    })),
    seriesOwned,
    seriesSubjectOf: (series ?? [])
      .filter((s) => s.subject_user_id === userId)
      .map((s) => ({ id: s.id, title: s.title, organizationId: s.organization_id })),
    topSeries,
    interviewCount: interviewCount ?? 0,
    factCount,
    auditLog: (audit ?? []).map((a) => ({
      id: a.id,
      at: a.at,
      action: a.action,
      actorEmail: a.actor_email,
    })),
  };
}

// =========================================================================
// Platform growth — Dashboard KPI tile + 12-week signup spark chart. Server
// code (not a workflow), so `new Date()` at call time is fine here.
// =========================================================================

const WEEK_MS = 7 * 86_400_000;
const GROWTH_DORMANT_DAYS = 30; // dashboard "dormant" threshold — distinct from the account-level DORMANT_DAYS above.

// Monday 00:00:00 UTC of the week containing `date` (ISO week start).
function startOfWeekUTC(date: Date): Date {
  const day = date.getUTCDay(); // 0 (Sun) .. 6 (Sat)
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - diffToMonday);
  return monday;
}

export type GrowthBucket = { weekStart: string; count: number }; // ISO date (Monday), signups that week

export type PlatformGrowth = {
  weekly: GrowthBucket[]; // exactly 12 buckets, oldest→newest, contiguous weeks ending this week
  totalUsers: number;
  newThisWeek: number;
  dormantCount: number; // most-recent interview (any org they belong to) >30d ago, or never had one
};

export async function getPlatformGrowth(): Promise<PlatformGrowth> {
  const svc = serviceClient();

  const [{ data: users }, { data: memberships }, { data: interviews }] = await Promise.all([
    svc.from("users").select("id, created_at"),
    svc.from("memberships").select("user_id, organization_id"),
    svc.from("interviews").select("organization_id, started_at").order("started_at", { ascending: false }),
  ]);

  // --- 12 contiguous ISO-week buckets, oldest -> newest, ending this week ---
  const currentWeekStart = startOfWeekUTC(new Date()).getTime();
  const bucketStarts: number[] = [];
  for (let i = 11; i >= 0; i--) {
    bucketStarts.push(currentWeekStart - i * WEEK_MS);
  }

  const weekly: GrowthBucket[] = bucketStarts.map((start) => ({
    weekStart: new Date(start).toISOString().slice(0, 10),
    count: 0,
  }));

  for (const u of users ?? []) {
    const t = new Date(u.created_at).getTime();
    for (let i = 0; i < bucketStarts.length; i++) {
      const start = bucketStarts[i];
      if (t >= start && t < start + WEEK_MS) {
        weekly[i].count += 1;
        break;
      }
    }
  }

  // --- dormant: most-recent interview across any org this user belongs to ---
  const orgIdsByUser = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    const ids = orgIdsByUser.get(m.user_id) ?? [];
    ids.push(m.organization_id);
    orgIdsByUser.set(m.user_id, ids);
  }

  // Pre-sorted desc, so the first hit per org is already the max.
  const lastActivityByOrg = new Map<string, string>();
  for (const iv of interviews ?? []) {
    if (!lastActivityByOrg.has(iv.organization_id)) {
      lastActivityByOrg.set(iv.organization_id, iv.started_at);
    }
  }

  let dormantCount = 0;
  for (const u of users ?? []) {
    const orgIds = orgIdsByUser.get(u.id) ?? [];
    const lastActivity = orgIds.reduce<string | null>((latest, orgId) => {
      const at = lastActivityByOrg.get(orgId);
      if (!at) return latest;
      if (!latest || new Date(at) > new Date(latest)) return at;
      return latest;
    }, null);
    if (!lastActivity || daysSince(lastActivity) > GROWTH_DORMANT_DAYS) {
      dormantCount += 1;
    }
  }

  return {
    weekly,
    totalUsers: (users ?? []).length,
    newThisWeek: weekly[weekly.length - 1]?.count ?? 0,
    dormantCount,
  };
}
