import "server-only";
import { serviceClient } from "@/db/service";

export type OrgListRow = {
  id: string;
  name: string;
  plan: string;
  status: "active" | "suspended";
  credits_remaining: number;
  created_at: string;
  owner_email: string | null;
  interviews_this_month: number;
};

export async function listOrganizations(opts: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<OrgListRow[]> {
  const svc = serviceClient();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  // Pull orgs + owner email + this-month interview count in one round trip.
  // We fetch a bit wide and filter in memory on search — the scale here is
  // "platform admin looking at the customer list," not a hot path.
  let query = svc
    .from("organizations")
    .select(`
      id,
      name,
      plan,
      status,
      credits_remaining,
      created_at,
      memberships!inner ( role, users ( email ) ),
      interview_requests ( id, sent_at )
    `)
    .eq("memberships.role", "owner")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts.search) {
    // Supabase doesn't easily OR across joined-table columns; apply name
    // search server-side and email search in memory.
    query = query.ilike("name", `%${opts.search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const rows: OrgListRow[] = (data ?? []).map((row) => {
    const memberships = row.memberships as unknown as Array<{ role: string; users: { email?: string } | null }> | { role: string; users: { email?: string } | null };
    const owner = Array.isArray(memberships) ? memberships[0] : memberships;
    const ownerEmail = owner?.users?.email ?? null;
    const interviewRequests = row.interview_requests as unknown as Array<{ id: string; sent_at: string | null }> | null;
    const interviewsThisMonth = (interviewRequests ?? []).filter(
      (r) => r.sent_at && new Date(r.sent_at) >= monthStart,
    ).length;
    return {
      id: row.id,
      name: row.name,
      plan: row.plan,
      status: row.status as "active" | "suspended",
      credits_remaining: row.credits_remaining,
      created_at: row.created_at,
      owner_email: ownerEmail,
      interviews_this_month: interviewsThisMonth,
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
  recentRequests: Array<{
    id: string;
    status: string;
    sent_at: string | null;
    completed_at: string | null;
    contact_phone: string;
  }>;
  auditLog: Array<{
    id: number;
    at: string;
    action: string;
    actor_email: string | null;
    actor_user_id: string | null;
    meta: unknown;
  }>;
};

export async function getOrganizationDetail(orgId: string): Promise<OrgDetail | null> {
  const svc = serviceClient();

  const { data: org, error: orgErr } = await svc
    .from("organizations")
    .select("id, name, plan, status, credits_remaining, stripe_customer_id, created_at")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr) throw new Error(orgErr.message);
  if (!org) return null;

  const { data: members } = await svc
    .from("memberships")
    .select("user_id, role, created_at, users ( email )")
    .eq("organization_id", orgId);

  const { data: requests } = await svc
    .from("interview_requests")
    .select("id, status, sent_at, completed_at, contacts ( phone_e164 )")
    .eq("organization_id", orgId)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(25);

  // audit_logs for this org: either action targeted it, or actor was a member
  const { data: audit } = await svc
    .from("audit_logs")
    .select("id, at, action, actor_email, actor_user_id, meta, target_id, organization_id")
    .or(`organization_id.eq.${orgId},target_id.eq.${orgId}`)
    .order("at", { ascending: false })
    .limit(25);

  return {
    organization: {
      ...org,
      status: org.status as "active" | "suspended",
    },
    members: (members ?? []).map((m) => ({
      user_id: m.user_id,
      email: (m.users as { email?: string } | null)?.email ?? "",
      role: m.role,
      created_at: m.created_at,
    })),
    recentRequests: (requests ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      sent_at: r.sent_at,
      completed_at: r.completed_at,
      contact_phone: (r.contacts as { phone_e164?: string } | null)?.phone_e164 ?? "",
    })),
    auditLog: (audit ?? []).map((a) => ({
      id: a.id,
      at: a.at,
      action: a.action,
      actor_email: a.actor_email,
      actor_user_id: a.actor_user_id,
      meta: a.meta,
    })),
  };
}

export async function adjustOrgCredits(args: {
  orgId: string;
  delta: number;
  reason: string;
  actorEmail: string;
}): Promise<void> {
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
