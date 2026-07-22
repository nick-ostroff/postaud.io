import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { snoozeSeriesAction } from "./actions";

type Props = {
  name: string;
  seriesId: string;
  ownerFirstName: string;
  topicName: string | null;
  memoriesCount: number;
  /** The persona name derived from the series' voice. */
  interviewerName: string;
};

/**
 * The interviewee's one-job home screen (mockup #1c) — a non-admin viewer
 * who is the subject of a series lands here instead of the workspace grid.
 * Exactly one primary action: "Start talking". "Not today" and "Your
 * memories" are quiet, secondary escape hatches, not competing CTAs.
 */
export function IntervieweeHome({ name, seriesId, ownerFirstName, topicName, memoriesCount, interviewerName }: Props) {
  const prompt = topicName
    ? `${ownerFirstName} would love to hear about ${topicName}.`
    : `${ownerFirstName} would love to hear whatever you feel like sharing today.`;

  const memoriesLabel =
    memoriesCount > 0
      ? `${memoriesCount} ${memoriesCount === 1 ? "memory" : "memories"} saved so far.`
      : "Nothing saved yet — today could be the first.";

  return (
    <div className="flex min-h-[72vh] w-full flex-col items-center justify-between text-center">
      <div className="serif pt-2 text-[15px] text-faint">Good to see you, {name}</div>

      <div className="flex flex-col items-center">
        <p className="serif mx-auto max-w-[320px] text-[24px] leading-[1.35]">{prompt}</p>

        <Link
          href={`/app/series/${seriesId}/interview`}
          className="mt-9 flex h-[168px] w-[168px] flex-col items-center justify-center gap-1 rounded-full bg-green text-white shadow-card transition-colors hover:bg-green-deep"
        >
          <span aria-hidden className="text-[26px]">
            ◉
          </span>
          <span className="text-[16px] font-semibold">Start talking</span>
          <span className="text-[11px] font-medium opacity-80">{interviewerName} is ready to listen</span>
        </Link>

        <form action={snoozeSeriesAction} className="mt-6">
          <input type="hidden" name="seriesId" value={seriesId} />
          <Button type="submit" variant="ghost">
            Not today
          </Button>
        </form>
      </div>

      <div className="pb-2">
        <Link href="/app/memories" className="text-[13px] font-medium text-green-deep">
          Your memories ▸
        </Link>
        <p className="mt-1.5 text-[12.5px] text-faint">{memoriesLabel}</p>
      </div>
    </div>
  );
}
