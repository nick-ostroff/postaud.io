import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformUserDetail } from "@/db/queries/admin";
import { ImpersonateButton } from "@/components/super/ImpersonateButton";

type Params = Promise<{ id: string }>;

export const metadata = { title: "User — Operator — PostAud.io" };

function SeriesList({ rows, empty }: { rows: Array<{ id: string; title: string }>; empty: string }) {
  if (rows.length === 0) return <p className="py-3 text-[13px] text-neutral-400">{empty}</p>;
  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {rows.map((s) => (
        <div key={s.id} className="truncate py-2.5 font-serif text-[15px] text-neutral-900 dark:text-white">
          {s.title}
        </div>
      ))}
    </div>
  );
}

export default async function SuperUserDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const detail = await getPlatformUserDetail(id);
  if (!detail) notFound();
  const { user, orgs, seriesOwned, seriesSubjectOf, interviewCount, factCount, auditLog } = detail;

  const name = user.displayName ?? user.email.split("@")[0];
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-7">
      <div>
        <Link href="/super" className="text-[12.5px] text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
          Users
        </Link>
        <span className="mx-1.5 text-[12.5px] text-neutral-400">/</span>
        <span className="text-[12.5px] text-neutral-500">{user.email}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-[14px] font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              {initials}
            </span>
            <h1 className="font-serif text-[26px] text-neutral-900 dark:text-white">{name}</h1>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              {user.email}
            </span>
            <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              <span className="text-neutral-400 dark:text-neutral-500">Joined </span>
              {new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <ImpersonateButton userId={user.id} />
            <a
              href={`mailto:${user.email}`}
              className="inline-flex items-center rounded-lg border border-neutral-300 px-3.5 py-2 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-white/5"
            >
              ✉ Email
            </a>
          </div>
          <span className="text-[11.5px] text-neutral-400 dark:text-neutral-600">
            every impersonation is logged
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.1fr_1.4fr]">
        <div className="flex flex-col gap-[18px]">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Accounts</h3>
            <div className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
              {orgs.length === 0 && <p className="py-3 text-[13px] text-neutral-400">Belongs to no account.</p>}
              {orgs.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link
                    href={`/super/accounts/${o.id}`}
                    className="truncate text-[13.5px] font-semibold text-neutral-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-400"
                  >
                    {o.name}
                  </Link>
                  <span className="flex-shrink-0 text-[12px] capitalize text-neutral-500">
                    {o.role}
                    {!o.accepted && " · invited"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Activity</h3>
            <dl className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
              {[
                ["Interviews", String(interviewCount)],
                ["Facts on file", String(factCount)],
                ["Series owned", String(seriesOwned.length)],
                ["Subject of", String(seriesSubjectOf.length)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between py-2 text-[13.5px]">
                  <span className="text-neutral-500">{k}</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">{v}</span>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="flex flex-col gap-[18px]">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Series they own</h3>
            <p className="mt-1 text-[12.5px] text-neutral-500">Titles only — content requires impersonation.</p>
            <div className="mt-2">
              <SeriesList rows={seriesOwned} empty="No series created." />
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Series they are the subject of</h3>
            <div className="mt-2">
              <SeriesList rows={seriesSubjectOf} empty="Not the subject of any series." />
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Recent activity</h3>
            <div className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
              {auditLog.length === 0 && <p className="py-3 text-[13px] text-neutral-400">No audit entries.</p>}
              {auditLog.map((a) => (
                <div key={a.id} className="flex gap-3 py-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                  <div>
                    <div className="text-[13px] text-neutral-800 dark:text-neutral-200">{a.action}</div>
                    <div className="text-[11.5px] text-neutral-400">
                      {new Date(a.at).toLocaleString()}
                      {a.actorEmail && ` · ${a.actorEmail}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
