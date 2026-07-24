import { Card } from "@/components/ui/Card";
import type { InterviewUsage } from "@/db/types";
import { RATES_UPDATED, summarizeUsage } from "@/server/usage/pricing";
import { anthropicBreakdown, fmtInt, fmtUsd, providerLabel, realtimeBreakdown } from "@/components/usage/format";

/**
 * Series-wide "Activity" card for the settings page: session count, total
 * talk time, and the summed interview_usage ledger across every session —
 * the whole-series version of the results page's per-session UsageCard.
 * Token counts are exact; dollar figures are labeled estimates from
 * pricing.ts's RATES table, never presented as billed truth.
 */
export function ActivityCard({
  rows,
  sessionCount,
  totalTalkLabel,
}: {
  rows: InterviewUsage[];
  sessionCount: number;
  totalTalkLabel: string;
}) {
  const summary = summarizeUsage(rows);

  return (
    <Card className="px-[22px] py-5">
      <h3>Activity</h3>
      <p className="mt-1 text-[13px] text-muted">
        {sessionCount === 0
          ? "No sessions yet — usage shows up here after the first one."
          : `${sessionCount} ${sessionCount === 1 ? "session" : "sessions"} · ${totalTalkLabel} of conversation.`}
      </p>

      {rows.length > 0 && (
        <>
          <div className="mt-3 flex flex-col gap-3.5">
            {summary.byModel.map((g) => (
              <div key={`${g.provider}::${g.model}`} className="border-b border-line pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[13.5px] font-semibold">
                    {providerLabel(g.provider)} — <span className="text-muted">{g.model}</span>
                  </div>
                  <div className="tabular-nums text-[13.5px] font-semibold">
                    {g.isUnknownModel ? "—" : `≈ ${fmtUsd(g.costUsd)}`}
                  </div>
                </div>
                <div className="mt-1 tabular-nums text-[12px] text-faint">
                  {fmtInt(g.totalTokens)} tokens ·{" "}
                  {g.provider === "openai_realtime" ? realtimeBreakdown(g) : anthropicBreakdown(g)}
                </div>
                {g.isUnknownModel && (
                  <div className="mt-0.5 text-[11.5px] text-amber">no published rate on file for this model</div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3.5 flex items-baseline justify-between border-t border-line pt-3">
            <div className="text-[13px] text-muted">
              Total: <span className="tabular-nums font-semibold text-ink">{fmtInt(summary.totalTokens)} tokens</span>
            </div>
            <div className="tabular-nums text-[15px] font-semibold">≈ {fmtUsd(summary.totalCostUsd)}</div>
          </div>

          <p className="mt-3 text-[11px] leading-[1.5] text-faint">
            Totals cover every session in this series, including failed processing attempts. Token counts are
            exact, as reported by the provider. Dollar amounts are estimates from published rates (updated{" "}
            {RATES_UPDATED}) — confirm against your provider invoices.
            {summary.hasCoarseRows ? " · some rows use a blended rate estimate" : ""}
            {summary.hasUnknownRates ? " · one or more models have no rate on file (shown as —)" : ""}
          </p>
        </>
      )}

      {rows.length === 0 && sessionCount > 0 && (
        <p className="mt-2 text-[13px] text-muted">
          No usage recorded yet — these sessions may predate usage tracking.
        </p>
      )}
    </Card>
  );
}
