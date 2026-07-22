import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  getSeries,
  getViewer,
  listInterviewsForSeries,
  listMembers,
  listPendingQueuedQuestions,
} from "@/db/queries";
import { QueueList, type QueueItem } from "./QueueList";

type Params = Promise<{ id: string }>;

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * The question queue (mockup 1b): saved follow-ups from Flow sessions plus
 * member-added questions, in the order the next Quickfire session will ask
 * them. Anyone who can view the series sees it; management actions are
 * gated per-action in the API (admin for reorder/pin/remove).
 */
export default async function QueuePage({ params }: { params: Params }) {
  const { id } = await params;
  const { supabase, role } = await getViewer();

  const series = await getSeries(supabase, id);
  if (!series) notFound();

  const [pending, sessions, members] = await Promise.all([
    listPendingQueuedQuestions(supabase, id),
    listInterviewsForSeries(supabase, id),
    listMembers(supabase),
  ]);

  const sessionNumberByInterview = new Map(sessions.map((s) => [s.id, s.sessionNumber] as const));
  const nameByUser = new Map(
    members.map((m) => [m.user_id, m.users?.display_name || m.users?.email || "a member"] as const),
  );

  const items: QueueItem[] = pending.map((q) => ({
    id: q.id,
    text: q.text,
    provenance:
      q.source === "flow" && q.source_interview_id
        ? `saved during Session ${sessionNumberByInterview.get(q.source_interview_id) ?? "?"} · ${relativeDay(q.created_at)}`
        : `queued by ${q.created_by ? nameByUser.get(q.created_by) ?? "a member" : "a member"} · ${relativeDay(q.created_at)}`,
  }));

  return (
    <div className="w-full">
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
        / Question queue
      </div>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px]">Question queue</h1>
          <div className="mt-0.5 text-[13.5px] text-muted">
            Saved follow-ups — the next Quickfire session asks these first.
          </div>
        </div>
        {items.length > 0 ? (
          <Link href={`/app/series/${series.id}/interview?mode=quickfire`}>
            <Button variant="primary">Answer these now</Button>
          </Link>
        ) : null}
      </div>
      {/*
        Keyed by the pending id order: router.refresh() re-fetches this
        server page but React preserves an already-mounted client
        component's own useState across the merge (per Next's docs), so
        QueueList's internal `items` wouldn't otherwise pick up an add/pin/
        remove until a hard reload. Changing the key forces a clean remount
        with the fresh server truth once refresh() resolves.
      */}
      <QueueList
        key={items.map((i) => i.id).join(",")}
        seriesId={series.id}
        initialItems={items}
        canManage={role === "admin"}
      />
    </div>
  );
}
