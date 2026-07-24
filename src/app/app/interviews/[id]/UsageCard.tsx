import { Card } from "@/components/ui/Card";
import type { InterviewUsage } from "@/db/types";
import { RATES_UPDATED, summarizeUsage } from "@/server/usage/pricing";
import { anthropicBreakdown, fmtInt, fmtUsd, providerLabel, realtimeBreakdown } from "@/components/usage/format";

/**
 * Admin-only "API usage & cost" card for the session results page (usage-2).
 * Token counts are the EXACT values summed straight off the interview_usage
 * ledger; dollar figures are clearly-labeled ESTIMATES from `pricing.ts`'s
 * editable RATES table — never presented as billed truth.
 */
export function UsageCard({ rows, creditCharged }: { rows: InterviewUsage[]; creditCharged: boolean }) {
  if (rows.length === 0) {
    return (
      <Card className="px-[22px] py-5">
        <h3>API usage & cost</h3>
        <p className="mt-2 text-[13.5px] text-muted">
          No usage recorded for this session — it may predate usage tracking, or capture didn&apos;t run.
        </p>
      </Card>
    );
  }

  const summary = summarizeUsage(rows);

  return (
    <Card className="px-[22px] py-5">
      <h3>API usage & cost</h3>

      <div className="mt-2 flex flex-col gap-3.5">
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
              {fmtInt(g.totalTokens)} tokens · {g.provider === "openai_realtime" ? realtimeBreakdown(g) : anthropicBreakdown(g)}
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

      <div className="mt-1 text-[12px] text-muted">
        Credit charged for this session: <span className="font-medium text-ink-soft">{creditCharged ? "1 credit" : "not yet charged"}</span>
      </div>

      <p className="mt-3 text-[11px] leading-[1.5] text-faint">
        Token counts are exact, as reported by the provider. Dollar amounts are estimates from published rates
        (updated {RATES_UPDATED}) — confirm against your provider invoices.
        {summary.hasCoarseRows ? " · some rows use a blended rate estimate" : ""}
        {summary.hasUnknownRates ? " · one or more models have no rate on file (shown as —)" : ""}
      </p>
    </Card>
  );
}
