import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { getSeries, getViewer } from "@/db/queries";
import { canInterviewSeries } from "@/server/interviews/access";

type Params = Promise<{ id: string }>;

/**
 * "Hand the phone to {subject}" (mockup #1b) — the moment before a
 * whoever-can-interview admin/member starts a session on behalf of a
 * subject who has no account of their own (`subject_kind` 'person' or
 * 'organization', so `subject_user_id` stays null; see the same reduction
 * used in `/app/series/[id]/access`). Only reachable by someone who can
 * already interview this series — same guard as the live interview route
 * itself, so there's no way to land here for a series you can't run.
 */
export default async function HandoffPage({ params }: { params: Params }) {
  const { id } = await params;
  const { user, supabase, role } = await getViewer();

  const series = await getSeries(supabase, id);
  if (!series) notFound();
  if (series.subject_kind !== "person" && series.subject_kind !== "organization") notFound();

  const canInterview = await canInterviewSeries(supabase, {
    userId: user.id,
    role,
    seriesSubjectUserId: series.subject_user_id,
    seriesId: series.id,
  });
  if (!canInterview) notFound();

  return (
    <div className="flex min-h-[72vh] w-full flex-col items-center justify-between text-center">
      <div className="text-[12.5px] text-faint">{series.title}</div>

      <div className="flex flex-col items-center">
        <h1 className="serif max-w-[320px] text-[32px] leading-[1.2]">
          Hand the phone to {series.subject_name}
        </h1>

        <ul className="mt-7 flex max-w-[300px] flex-col gap-3 text-left text-[14px] leading-[1.4] text-ink-soft">
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-[3px] text-green-deep">
              ●
            </span>
            Anna will call {series.subject_name} by name
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-[3px] text-green-deep">
              ●
            </span>
            Questions will come slower and larger on screen
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-[3px] text-green-deep">
              ●
            </span>
            Take the phone back any time to rephrase or skip
          </li>
        </ul>
      </div>

      <div className="flex w-full max-w-[300px] flex-col items-center gap-2.5 pb-2">
        <Link href={`/app/series/${series.id}/interview?handoff=1`} className="w-full">
          <Button variant="primary" size="big" className="w-full justify-center">
            {series.subject_name} is ready
          </Button>
        </Link>
        <Link href="/app" className="text-[13px] font-medium text-muted">
          Back to my view
        </Link>
      </div>
    </div>
  );
}
