import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { getSeries, getSeriesSummaries, getViewer, listMembers } from "@/db/queries";
import { AccessManager, type AccessLevel, type AccessMember } from "./AccessManager";

type Params = Promise<{ id: string }>;

export default async function SeriesAccessPage({ params }: { params: Params }) {
  const { id } = await params;
  const { user, supabase, role } = await getViewer();

  const series = await getSeries(supabase, id);
  if (!series) notFound();

  // Access management is admin-only — bounce non-admins back to the series
  // hub rather than showing a page whose PUT would 403 on every change.
  if (role !== "admin") {
    redirect(`/app/series/${id}`);
  }

  const [members, accessRes, summaries] = await Promise.all([
    listMembers(supabase),
    supabase.from("series_access").select("user_id, can_view, can_interview").eq("series_id", id),
    getSeriesSummaries(supabase, [id]),
  ]);
  if (accessRes.error) throw new Error(accessRes.error.message);

  const levelByUser = new Map<string, AccessLevel>();
  for (const row of accessRes.data ?? []) {
    if (row.can_interview) levelByUser.set(row.user_id, "interview");
    else if (row.can_view) levelByUser.set(row.user_id, "view");
  }

  const owners = members.filter((m) => m.role === "admin");
  const subjectUserId = series.subject_user_id;
  const subjectMember = subjectUserId ? members.find((m) => m.user_id === subjectUserId) ?? null : null;
  // The subject has implicit full access via `can_view_series`/`can_interview_series`
  // RLS regardless of any series_access row — pin them as their own row so
  // they're never invisible, unless they're already shown as an owner above.
  const showSubjectPinned = subjectUserId != null && !owners.some((o) => o.user_id === subjectUserId);

  const editableMembers: AccessMember[] = members
    .filter((m) => m.role !== "admin" && m.user_id !== subjectUserId)
    .map((m) => ({
      userId: m.user_id,
      name: m.users?.display_name || m.users?.email || "Unknown",
      email: m.users?.email ?? "",
      pending: !m.accepted_at,
      level: levelByUser.get(m.user_id) ?? "none",
    }));

  // subject_kind 'person'/'organization' never have an account (subject_user_id
  // stays null) — 'self'/'member' always do. So "no account" reduces to this.
  const noAccountSubject = subjectUserId == null;

  const summary = summaries[id];
  const memoriesWord = summary.memoriesCount === 1 ? "memory" : "memories";
  const sessionsWord = summary.sessionsCount === 1 ? "session" : "sessions";
  const subjectSubtitle = series.subject_relationship
    ? `${series.subject_name} · ${series.subject_relationship}`
    : series.subject_name;

  return (
    <div>
      <div className="mb-2 text-[12.5px] text-faint">
        <Link href="/app" className="text-muted">
          Home
        </Link>{" "}
        /{" "}
        <Link href="/app/series" className="text-muted">
          Series
        </Link>{" "}
        /{" "}
        <Link href={`/app/series/${series.id}`} className="text-muted">
          {series.title}
        </Link>{" "}
        / Access
      </div>

      <div className="mb-[22px]">
        <h1 className="text-[28px]">Who can see {series.title}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Chip>
            <Avatar name={series.subject_name} size="md" tone="plain" />
            {subjectSubtitle}
          </Chip>
          <Chip>
            {summary.memoriesCount} {memoriesWord} · {summary.sessionsCount} {sessionsWord} ·{" "}
            {Math.round(summary.meanCoverage * 100)}% covered
          </Chip>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="flex flex-col gap-3.5">
          <Card className="px-[22px] py-5">
            <h3>Owner{owners.length === 1 ? "" : "s"}</h3>
            {owners.map((o) => {
              const name = o.users?.display_name || o.users?.email || "Unknown";
              return (
                <div key={o.user_id} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0 last:pb-1">
                  <Avatar name={name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold">
                      {name} {o.user_id === user.id && <span className="text-xs font-normal text-faint">· you</span>}
                    </div>
                    <div className="truncate text-xs text-faint">{o.users?.email}</div>
                  </div>
                  <Badge>Owner</Badge>
                </div>
              );
            })}
            <div className="mt-2 text-xs text-faint">
              Owners run the guide, the topic queue, and access — and can hand ownership on.
            </div>
          </Card>

          <Card className="px-[22px] py-5">
            <h3>Members</h3>
            <p className="text-[13px] text-muted">Series access sits on top of each member&apos;s workspace role.</p>

            {showSubjectPinned && (
              <div className="flex items-center gap-3 border-b border-line py-3">
                <Avatar name={series.subject_name} tone="plain" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold">
                    {subjectMember?.users?.display_name || subjectMember?.users?.email || series.subject_name}
                    <span className="ml-1.5 inline-block align-middle">
                      <Badge tone="muted">subject</Badge>
                    </span>
                  </div>
                  <div className="truncate text-xs text-faint">
                    {subjectMember?.users?.email || "records their own sessions"}
                  </div>
                </div>
                <Badge tone="muted">Subject — always has access</Badge>
              </div>
            )}

            <AccessManager seriesId={series.id} initialMembers={editableMembers} />
          </Card>
        </div>

        <div className="flex flex-col gap-[18px]">
          {noAccountSubject && (
            <Card className="px-[22px] py-5">
              <h3>Subjects without an account</h3>
              <p className="mt-1 text-[13px] text-muted">
                {series.subject_name} never needs a login. Open this series on your phone and hand them the
                mic — the session records into the workspace under your account, and their words land in the
                knowledge base just the same.
              </p>
              <div className="mt-2">
                <Link href={`/app/series/${series.id}/handoff`} className="text-[13px] font-medium">
                  See how hand-the-mic works →
                </Link>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
