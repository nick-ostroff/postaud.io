import Link from "next/link";
import { notFound } from "next/navigation";
import { serviceClient } from "@/db/service";
import { getFactDetail, getViewer, listInterviewsForSeries } from "@/db/queries";
import { signFactAudio } from "@/server/facts/audio-url";
import { ReviewActions } from "./ReviewActions";

type Params = Promise<{ factId: string }>;

/**
 * The review-detail screen (mockup #1g) — the fact in the interviewee's own
 * words, its source audio, and the three review actions. Access is the same
 * `can_view_series` RLS every knowledge-base read uses (via `getFactDetail`,
 * request-scoped client) — a fact the caller can't see reads as `notFound()`.
 *
 * The audio URL is signed here, server-side, right before render (not via a
 * client-side fetch to `/api/facts/[id]/audio-url` — that route exists as a
 * standalone API surface, sharing the same `signFactAudio` helper) so the
 * page has no loading flicker for the player.
 */
export default async function MemoryDetailPage({ params }: { params: Params }) {
  const { factId } = await params;
  const { supabase } = await getViewer();

  const fact = await getFactDetail(supabase, factId);
  if (!fact) notFound();

  const sessions = await listInterviewsForSeries(supabase, fact.seriesId);
  const session = sessions.find((s) => s.id === fact.sourceInterviewId) ?? null;

  const audio = await signFactAudio(serviceClient(), {
    audioPath: fact.audioPath,
    audioOffsetSec: fact.audioOffsetSec,
  });

  const sourceLine = [session ? `Session ${session.sessionNumber}` : null, fact.seriesTitle]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-1 pb-4 pt-2">
      <Link href="/app/memories" className="text-[13px] font-medium text-muted">
        ‹ Your memories
      </Link>

      <p className="serif mt-[22px] text-[23px] italic leading-[1.4] text-ink">&ldquo;{fact.statement}&rdquo;</p>

      {audio && (
        <audio controls preload="none" className="mt-[22px] w-full" src={`${audio.url}#t=${audio.startSec}`}>
          Your browser does not support audio playback.
        </audio>
      )}

      {sourceLine && <p className="mt-2 text-[13px] text-muted">{sourceLine}</p>}

      <div className="mt-6">
        <ReviewActions factId={fact.id} initialStatement={fact.statement} />
      </div>

      <p className="mt-[18px] text-center text-[12.5px] text-faint">
        The original recording never changes. Your corrections update the memory.
      </p>
    </div>
  );
}
