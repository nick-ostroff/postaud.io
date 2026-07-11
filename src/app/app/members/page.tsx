import { getViewer, listMembers } from "@/db/queries";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { InviteForm } from "./InviteForm";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  interviewer: "Interviewer",
  viewer: "Viewer",
};

/** "Today" / "Yesterday" / "N days ago" / calendar date — matches the mockup's Last active column. */
function formatJoined(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function MembersPage() {
  const { supabase, organization, role } = await getViewer();
  const isAdmin = role === "admin";
  const members = organization ? await listMembers(supabase) : [];

  return (
    <div>
      <div className="mb-[22px] flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px]">Members</h1>
          <div className="mt-[3px] text-[13.5px] text-muted">
            {members.length} {members.length === 1 ? "person" : "people"} in {organization?.name ?? "your"} workspace.
          </div>
        </div>
      </div>

      {isAdmin && <InviteForm />}

      <Card className="overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              <th className="border-b border-line-strong px-3.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
                Member
              </th>
              <th className="border-b border-line-strong px-3.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
                Role
              </th>
              <th className="border-b border-line-strong px-3.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
                Joined
              </th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3.5 py-8 text-center text-muted">
                  No members yet.
                </td>
              </tr>
            )}
            {members.map((m) => {
              const email = m.users?.email ?? "—";
              const name = m.users?.display_name || email;
              return (
                <tr key={m.user_id} className="hover:bg-[rgba(33,30,26,0.02)] [&:last-child>td]:border-b-0">
                  <td className="border-b border-line px-3.5 py-[13px] align-middle">
                    <div className="flex items-center gap-3">
                      <Avatar name={name} />
                      <div>
                        <div className="font-semibold text-ink">{name}</div>
                        <div className="text-xs text-faint">{email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-line px-3.5 py-[13px] align-middle">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink-soft">{ROLE_LABELS[m.role] ?? m.role}</span>
                      {!m.accepted_at && <Badge tone="amber">Invited — hasn&apos;t accepted</Badge>}
                    </div>
                  </td>
                  <td className="border-b border-line px-3.5 py-[13px] align-middle text-muted">
                    {formatJoined(m.accepted_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
