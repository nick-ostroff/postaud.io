import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SeriesPhotoEditor } from "@/components/series/SeriesPhotoEditor";
import { getSeries, getViewer, listMembers } from "@/db/queries";
import { profilePhotoUrl } from "@/server/profile/photo-url";
import { subjectPhotoUrl } from "@/server/series/photo-url";
import { AccessManager, type AccessLevel, type AccessMember } from "./AccessManager";
import type { VoiceId } from "@/lib/voices";
import { ArchiveSeriesButton } from "./ArchiveSeriesButton";
import { InterviewGuideForm } from "./InterviewGuideForm";
import { SeriesDetailsForm } from "./SeriesDetailsForm";

type Params = Promise<{ id: string }>;

/**
 * Series settings — the full-screen admin surface for one series: photo,
 * name/relationship/goal, who can see it (the old Access page lives here now),
 * and the archive action. Admin-only; non-admins bounce back to the series hub.
 */
export default async function SeriesSettingsPage({ params }: { params: Params }) {
  const { id } = await params;
  const { user, supabase, role } = await getViewer();

  const series = await getSeries(supabase, id);
  if (!series) notFound();

  if (role !== "admin") {
    redirect(`/app/series/${id}`);
  }

  const [members, accessRes, queueCountRes] = await Promise.all([
    listMembers(supabase),
    supabase.from("series_access").select("user_id, can_view, can_interview").eq("series_id", id),
    supabase.from("queued_questions").select("id", { count: "exact", head: true }).eq("series_id", id).eq("status", "pending"),
  ]);
  if (accessRes.error) throw new Error(accessRes.error.message);
  const queueCount = queueCountRes.count ?? 0;

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
      photoUrl: profilePhotoUrl(m.users?.avatar_path),
      pending: !m.accepted_at,
      level: levelByUser.get(m.user_id) ?? "none",
    }));

  // dont_bring_up is a Json column — same defensive narrowing the realtime
  // token route uses, so a malformed value renders as empty rather than crashing.
  const dontBringUp = Array.isArray(series.dont_bring_up)
    ? series.dont_bring_up.filter((v): v is string => typeof v === "string")
    : [];

  // subject_kind 'person'/'organization' never have an account (subject_user_id
  // stays null) — 'self'/'member' always do. So "no account" reduces to this.
  const noAccountSubject = subjectUserId == null;

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
        / Settings
      </div>

      <div className="mb-[22px]">
        <h1 className="text-[28px]">Series settings</h1>
        <div className="mt-0.5 text-[13.5px] text-muted">
          {series.title} — the photo, the basics, and who&apos;s in.
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="flex flex-col gap-3.5">
          <Card className="px-[22px] py-5">
            <h3>Details</h3>
            <div className="mt-3 flex items-center gap-3.5">
              <SeriesPhotoEditor
                seriesId={series.id}
                name={series.subject_name}
                photoUrl={subjectPhotoUrl(series)}
                canEdit
                size="lg"
              />
              <div className="text-[13px] text-muted">
                Tap the photo to change it — it shows on the dashboard, the story rail, and everywhere{" "}
                {series.subject_name} appears.
              </div>
            </div>
            <SeriesDetailsForm
              seriesId={series.id}
              initialTitle={series.title}
              initialRelationship={series.subject_relationship ?? ""}
              initialGoal={series.goal ?? ""}
              showRelationship={series.subject_kind !== "self"}
            />
          </Card>

          <Card className="px-[22px] py-5">
            <h3>Interview guide</h3>
            <p className="mt-1 text-[13px] text-muted">
              The guide-rails {series.interviewer_name} follows. Changes apply from the next session — topics
              to cover live in the topic queue on the series page.
            </p>
            <InterviewGuideForm
              seriesId={series.id}
              initialVoice={series.voice as VoiceId}
              initialOpeningPrompt={series.opening_prompt ?? ""}
              initialDontBringUp={dontBringUp}
              initialTone={series.tone}
              initialSessionMinutes={series.session_minutes as 10 | 20 | 45}
              initialConversationMode={series.conversation_mode}
              initialAskModeEachTime={series.ask_mode_each_time}
              initialQuickfireQueueOnly={series.quickfire_queue_only}
              initialPlannedSessions={series.planned_sessions}
            />
          </Card>

          <Card className="px-[22px] py-5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h3>Question queue</h3>
                <div className="mt-0.5 text-[13px] text-muted">Saved follow-ups from Flow sessions.</div>
              </div>
              <Link
                href={`/app/series/${series.id}/queue`}
                className="shrink-0 text-[13.5px] font-semibold text-green-deep"
              >
                {queueCount > 0 ? `${queueCount} waiting ›` : "Open ›"}
              </Link>
            </div>
          </Card>

          <Card className="px-[22px] py-5">
            <h3>Owner{owners.length === 1 ? "" : "s"}</h3>
            {owners.map((o) => {
              const name = o.users?.display_name || o.users?.email || "Unknown";
              return (
                <div key={o.user_id} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0 last:pb-1">
                  <Avatar name={name} src={profilePhotoUrl(o.users?.avatar_path)} />
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
            <h3>Who can see this</h3>
            <p className="text-[13px] text-muted">Series access sits on top of each member&apos;s workspace role.</p>

            {showSubjectPinned && (
              <div className="flex items-center gap-3 border-b border-line py-3">
                <Avatar name={series.subject_name} src={subjectPhotoUrl(series)} tone="plain" />
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

          <Card className="px-[22px] py-5">
            <h3>Archive</h3>
            <p className="mt-1 text-[13px] text-muted">
              Done with this series? Archiving tucks it out of the workspace — every session, memory, and
              export stays intact.
            </p>
            <div className="mt-3">
              <ArchiveSeriesButton seriesId={series.id} title={series.title} />
            </div>
          </Card>
        </div>
      </div>

    </div>
  );
}
