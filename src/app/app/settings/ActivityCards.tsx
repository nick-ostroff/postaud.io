import { Card } from "@/components/ui/Card";
import type { InterviewUsage } from "@/db/types";
import type { AuditLogRow } from "@/db/queries/activity";
import { RATES_UPDATED, summarizeUsage } from "@/server/usage/pricing";
import { anthropicBreakdown, fmtInt, fmtUsd, providerLabel, realtimeBreakdown } from "@/components/usage/format";

/**
 * Workspace-wide activity for the settings page (admin-only): the all-time
 * spend ledger and the audit trail of actions. The ledger is append-only and
 * survives deletion — rows whose session or series was deleted keep the
 * context_label stamped by the delete routes, so the totals here are a firm
 * account of everything ever spent, not just what still exists.
 */

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type SpendGroup = {
  key: string;
  label: string;
  deleted: boolean;
  latest: string;
  rows: InterviewUsage[];
};

export function SpendCard({
  rows,
  sessionLabelById,
}: {
  rows: InterviewUsage[];
  /** "{series} — Session N" for every interview that still exists. */
  sessionLabelById: Map<string, string>;
}) {
  const summary = summarizeUsage(rows);

  const groups = new Map<string, SpendGroup>();
  for (const row of rows) {
    const key = row.interview_id ?? `gone:${row.context_label ?? "unknown"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
      if (row.created_at > existing.latest) existing.latest = row.created_at;
      continue;
    }
    const label = row.interview_id
      ? (sessionLabelById.get(row.interview_id) ?? "Session")
      : (row.context_label ?? "Deleted session");
    groups.set(key, {
      key,
      label,
      deleted: row.interview_id == null,
      latest: row.created_at,
      rows: [row],
    });
  }
  const sessions = Array.from(groups.values()).sort((a, b) => (a.latest < b.latest ? 1 : -1));

  return (
    <Card className="px-[22px] py-5">
      <h3>Spending</h3>
      <p className="mt-1 text-[13px] text-muted">
        Every API cost this workspace has ever incurred — deleting a session or series never removes
        what it already cost.
      </p>

      {rows.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-muted">No usage recorded yet.</p>
      ) : (
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
              </div>
            ))}
          </div>

          <div className="mt-3.5 flex items-baseline justify-between border-t border-line pt-3">
            <div className="text-[13px] text-muted">
              All-time total:{" "}
              <span className="tabular-nums font-semibold text-ink">{fmtInt(summary.totalTokens)} tokens</span>
            </div>
            <div className="tabular-nums text-[15px] font-semibold">≈ {fmtUsd(summary.totalCostUsd)}</div>
          </div>

          <div className="mt-4 border-t border-line pt-3">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">By session</div>
            <div className="mt-1">
              {sessions.map((s) => {
                const sub = summarizeUsage(s.rows);
                return (
                  <div
                    key={s.key}
                    className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className={`truncate text-[13.5px] ${s.deleted ? "text-muted" : "text-ink"}`}>
                        {s.label}
                      </div>
                      <div className="mt-0.5 tabular-nums text-[11.5px] text-faint">
                        {fmtWhen(s.latest)} · {fmtInt(sub.totalTokens)} tokens
                      </div>
                    </div>
                    <div className="shrink-0 tabular-nums text-[13.5px] font-semibold">
                      {sub.hasUnknownRates ? "—" : `≈ ${fmtUsd(sub.totalCostUsd)}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-[1.5] text-faint">
            Token counts are exact, as reported by the provider, and include failed processing attempts.
            Dollar amounts are estimates from published rates (updated {RATES_UPDATED}) — confirm against
            your provider invoices.
            {summary.hasCoarseRows ? " · some rows use a blended rate estimate" : ""}
            {summary.hasUnknownRates ? " · one or more models have no rate on file (shown as —)" : ""}
          </p>
        </>
      )}
    </Card>
  );
}

/** Human phrasing for the audit-trail action slugs; unknown slugs show verbatim. */
const ACTION_LABELS: Record<string, string> = {
  "interview.deleted": "Deleted a session",
  "series.deleted": "Deleted a series",
  "fact.corrected": "Corrected a memory",
  "member.invited": "Invited a member",
  "admin.impersonation_started": "Support sign-in started",
  "admin.impersonation_ended": "Support sign-in ended",
};

export function ActionsCard({
  logs,
  nameByUserId,
  limit,
}: {
  logs: AuditLogRow[];
  nameByUserId: Map<string, string>;
  limit: number;
}) {
  return (
    <Card className="px-[22px] py-5">
      <h3>Actions</h3>
      <p className="mt-1 text-[13px] text-muted">
        The audit trail — deletions, corrections, invites, and support sign-ins across the workspace.
      </p>
      {logs.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-muted">Nothing logged yet.</p>
      ) : (
        <div className="mt-1">
          {logs.map((log) => {
            const who =
              (log.actor_user_id && nameByUserId.get(log.actor_user_id)) || log.actor_email || "System";
            return (
              <div key={log.id} className="border-b border-line py-2.5 last:border-b-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[13.5px]">{ACTION_LABELS[log.action] ?? log.action}</div>
                  <div className="shrink-0 tabular-nums text-[11.5px] text-faint">{fmtWhen(log.at)}</div>
                </div>
                <div className="mt-0.5 text-[11.5px] text-faint">{who}</div>
              </div>
            );
          })}
        </div>
      )}
      {logs.length >= limit && (
        <p className="mt-3 text-[11px] text-faint">Showing the {limit} most recent actions.</p>
      )}
    </Card>
  );
}
