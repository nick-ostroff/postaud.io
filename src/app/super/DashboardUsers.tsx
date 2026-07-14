"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PlatformUserRow, PlatformUserDetail } from "@/db/queries/admin";
import { relativeTime, daysSince } from "@/lib/time";
import { ImpersonateButton } from "@/components/super/ImpersonateButton";

export type DashboardUserStatus = "active" | "dormant" | "invited";
export type DashboardUserRow = PlatformUserRow & { status: DashboardUserStatus };

// Shared status derivation — used by the dashboard, the users list, and the
// user detail page so "Active"/"Dormant"/"Invited" always means the same
// thing everywhere in the operator console.
const STATUS_DORMANT_DAYS = 30;

export function computeStatus(u: Pick<PlatformUserRow, "orgs" | "lastActivity">): DashboardUserStatus {
  // Invited: every org membership this user has is still a pending
  // invite — nobody has accepted anything yet.
  if (u.orgs.length > 0 && u.orgs.every((o) => !o.accepted)) return "invited";
  if (!u.lastActivity) return "dormant";
  return daysSince(u.lastActivity) > STATUS_DORMANT_DAYS ? "dormant" : "active";
}

export function displayName(row: { displayName: string | null; email: string }): string {
  return row.displayName ?? row.email.split("@")[0];
}

export function initialOf(row: { displayName: string | null; email: string }): string {
  return (row.displayName ?? row.email).slice(0, 1).toUpperCase();
}

/** Compact "invited N · assignees N · subjects N" line — real counts only,
 *  shared by the desktop table's Network column, the panel, and mobile cards. */
export function networkLabel(row: { network: { invited: number; assignees: number; subjects: number } }): string {
  const { invited, assignees, subjects } = row.network;
  const parts: string[] = [];
  if (invited > 0) parts.push(`invited ${invited}`);
  if (assignees > 0) parts.push(`assignees ${assignees}`);
  if (subjects > 0) parts.push(`subjects ${subjects}`);
  return parts.length > 0 ? parts.join(" · ") : "organic";
}

export function Avatar({
  row,
  size = 30,
}: {
  row: { displayName: string | null; email: string };
  size?: number;
}) {
  return (
    <span
      className="grid flex-none place-items-center rounded-full bg-green-tint font-semibold text-green-deep"
      style={{ width: size, height: size, fontSize: size > 34 ? 15 : 11.5 }}
    >
      {initialOf(row)}
    </span>
  );
}

export function StatusPill({ status }: { status: DashboardUserStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-tint px-2.5 py-[3px] text-[11px] font-semibold text-green-deep">
        Active
      </span>
    );
  }
  if (status === "invited") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-tint px-2.5 py-[3px] text-[11px] font-semibold text-amber">
        Invited
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-ink/8 px-2.5 py-[3px] text-[11px] font-semibold text-muted">
      Dormant
    </span>
  );
}

function StatTile({ label, value, loading }: { label: string; value: number | undefined; loading: boolean }) {
  return (
    <div className="flex-1 rounded-[10px] bg-paper px-3 py-2.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted">{label}</div>
      <div className="mt-0.5 font-serif text-[19px] text-ink">
        {loading || value === undefined ? "—" : value.toLocaleString()}
      </div>
    </div>
  );
}

const TABLE_COLS = "220px 1fr 70px 100px 84px";

/**
 * Dashboard master-detail user list.
 * Desktop (lg+): compact table on the left; clicking a row fetches
 * /api/super/users/[id] and slides a 400px detail panel in on the right.
 * Below lg: no panel (too narrow) — rows render as cards linking straight
 * to the full profile page.
 */
type DetailFetch = { id: string; status: "loaded" | "error"; detail?: PlatformUserDetail };

export function DashboardUsers({ rows }: { rows: DashboardUserRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Only ever written from inside the fetch's own callbacks (a genuine
  // "external system" response), never synchronously in the effect body —
  // "loading" below is DERIVED from whether fetchState.id matches the
  // current selection, not a separately-set flag, so selecting a row never
  // needs an synchronous setState to kick off the loading UI.
  const [fetchState, setFetchState] = useState<DetailFetch | null>(null);
  // Bumped by "Try again" to re-run the effect below for the same
  // selectedId (the effect only re-runs on an actual dependency change).
  const [retryToken, setRetryToken] = useState(0);

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;
  const detail = fetchState?.id === selectedId && fetchState.status === "loaded" ? (fetchState.detail ?? null) : null;
  const detailError = fetchState?.id === selectedId && fetchState.status === "error";
  const detailLoading = selectedId !== null && fetchState?.id !== selectedId;

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    fetch(`/api/super/users/${selectedId}`)
      .then((res) => {
        if (!res.ok) throw new Error("failed to load user detail");
        return res.json() as Promise<PlatformUserDetail>;
      })
      .then((json) => {
        if (!cancelled) setFetchState({ id: selectedId, status: "loaded", detail: json });
      })
      .catch(() => {
        if (!cancelled) setFetchState({ id: selectedId, status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, retryToken]);

  // Re-triggers the fetch for whichever user is currently selected. Clearing
  // fetchState first makes detailLoading derive true immediately (same
  // "loading" UI as the initial load), then retryToken forces the effect to
  // re-run since selectedId itself hasn't changed.
  function retryDetail() {
    if (!selectedId) return;
    setFetchState(null);
    setRetryToken((t) => t + 1);
  }

  return (
    <>
      {/* Desktop (lg+): table + slide-in detail panel */}
      <div className="hidden lg:flex lg:min-h-0">
        <div
          className={
            "min-w-0 flex-1 overflow-hidden border border-line bg-white " +
            (selectedRow ? "rounded-l-xl border-r-0" : "rounded-xl")
          }
        >
          <div className="flex items-center gap-3 border-b border-line px-[18px] py-3.5">
            <div className="text-[13px] text-muted">{rows.length} users shown</div>
            <Link href="/super/users" className="ml-auto text-[12.5px] font-medium text-green-deep hover:text-green">
              View all →
            </Link>
          </div>
          <div
            className="grid items-center gap-x-3.5 border-b border-line px-[18px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.06em] text-muted"
            style={{ gridTemplateColumns: TABLE_COLS }}
          >
            <div>User</div>
            <div>Network</div>
            <div>Series</div>
            <div>Last active</div>
            <div>Status</div>
          </div>
          <div>
            {rows.length === 0 && (
              <div className="px-[18px] py-10 text-center text-[13px] text-muted">No users yet.</div>
            )}
            {rows.map((row) => {
              const selected = row.id === selectedId;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(selected ? null : row.id)}
                  className={
                    "grid w-full items-center gap-x-3.5 border-b border-line py-3.5 pr-[18px] text-left last:border-b-0 hover:bg-paper-2 " +
                    (selected ? "border-l-[3px] border-l-green bg-green-tint pl-[15px]" : "pl-[18px]")
                  }
                  style={{ gridTemplateColumns: TABLE_COLS }}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar row={row} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-ink">{displayName(row)}</div>
                      <div className="truncate text-[11px] text-muted">{row.email}</div>
                    </div>
                  </div>
                  <div className="truncate text-[12px] text-ink-soft">{networkLabel(row)}</div>
                  <div className="text-[12px] text-ink">{row.seriesCount || "—"}</div>
                  <div className="text-[12px] text-muted">{relativeTime(row.lastActivity)}</div>
                  <div>
                    <StatusPill status={row.status} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedRow && (
          <div
            // Keyed by user id so switching selections remounts the panel
            // and re-triggers the slide-in animation each time, not just
            // on the very first open.
            key={selectedRow.id}
            className="flex w-[400px] flex-none animate-panel-in flex-col overflow-hidden rounded-r-xl border border-line bg-white shadow-[-8px_0_20px_rgba(33,30,26,0.05)]"
          >
            <div className="flex items-center gap-3 border-b border-line px-[22px] py-[18px]">
              <Avatar row={selectedRow} size={42} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-ink">{displayName(selectedRow)}</div>
                <div className="truncate text-[12px] text-muted">{selectedRow.email}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close"
                className="flex-none text-[16px] text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>

            {detailError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-[22px] py-4 text-center">
                <div className="text-[12.5px] text-muted">Couldn&rsquo;t load this user&rsquo;s details.</div>
                <button
                  type="button"
                  onClick={retryDetail}
                  className="rounded-full border border-line-strong px-4 py-1.5 text-[12.5px] font-medium text-ink-soft hover:bg-paper-2"
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-[22px] py-4">
                <div className="flex gap-2.5">
                  <StatTile label="Series" value={detail?.seriesOwned.length} loading={detailLoading} />
                  <StatTile label="Facts" value={detail?.factCount} loading={detailLoading} />
                  <StatTile label="Sessions" value={detail?.interviewCount} loading={detailLoading} />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                    Network · invited {selectedRow.network.invited}
                  </div>
                  <div className="text-[12.5px] text-ink-soft">{networkLabel(selectedRow)}</div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Top series</div>
                  {detailLoading && <div className="text-[12.5px] text-muted">Loading…</div>}
                  {!detailLoading && detail && detail.topSeries.length === 0 && (
                    <div className="text-[12.5px] text-muted">No series created.</div>
                  )}
                  {!detailLoading && detail && detail.topSeries.length > 0 && (
                    <div className="flex flex-col overflow-hidden rounded-[10px] bg-paper">
                      {detail.topSeries.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-2 border-b border-line px-3.5 py-2.5 text-[12.5px] last:border-b-0"
                        >
                          <div className="min-w-0 flex-1 truncate font-serif">{s.title}</div>
                          <div className="flex-none text-[11.5px] text-muted">{s.facts.toLocaleString()} facts</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Recent</div>
                  {detailLoading && <div className="text-[12.5px] text-muted">Loading…</div>}
                  {!detailLoading && detail && detail.auditLog.length === 0 && (
                    <div className="text-[12.5px] text-muted">No recent activity.</div>
                  )}
                  {!detailLoading && detail && detail.auditLog.length > 0 && (
                    <div className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                      {detail.auditLog.slice(0, 6).map((a) => (
                        <div key={a.id} className="truncate">
                          {relativeTime(a.at)} · {a.action}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 border-t border-line px-[22px] py-3.5">
              <Link
                href={`/super/users/${selectedRow.id}`}
                className="flex-1 rounded-full border border-line-strong py-2 text-center text-[12.5px] font-medium text-ink-soft hover:bg-paper-2"
              >
                Full profile
              </Link>
              <ImpersonateButton
                userId={selectedRow.id}
                label="Impersonate"
                className="w-full rounded-full border border-line-strong py-2 text-center text-[12.5px] font-medium text-ink-soft hover:bg-paper-2 disabled:opacity-60"
              />
              <a
                href={`mailto:${selectedRow.email}`}
                className="flex-1 rounded-full border border-line-strong py-2 text-center text-[12.5px] font-medium text-ink-soft hover:bg-paper-2"
              >
                Email
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Mobile (<lg): cards, no panel — straight to the full profile */}
      <div className="flex flex-col gap-2.5 lg:hidden">
        {rows.length === 0 && (
          <div className="rounded-xl border border-line bg-white px-4 py-10 text-center text-[13px] text-muted">
            No users yet.
          </div>
        )}
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/super/users/${row.id}`}
            className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3.5"
          >
            <Avatar row={row} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-ink">{displayName(row)}</div>
              <div className="truncate text-[12px] text-muted">
                invited {row.network.invited} · {row.seriesCount} series · {row.factsCount.toLocaleString()} facts
              </div>
            </div>
            <StatusPill status={row.status} />
          </Link>
        ))}
      </div>
    </>
  );
}
