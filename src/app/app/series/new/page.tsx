import { redirect } from "next/navigation";
import { BackLink } from "@/components/nav/BackLink";
import { getViewer, listMembers } from "@/db/queries";
import type { MemberOption } from "./formkit";
import { QuickCreate } from "./QuickCreate";
import { Wizard } from "./Wizard";

type SearchParams = Promise<{ quick?: string }>;

export default async function NewSeriesPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, supabase, organization, role } = await getViewer();
  // Series creation is admin-only — bounce non-admins back to the home page
  // rather than letting them land on a form that will 403 on submit.
  if (!organization || role !== "admin") {
    redirect("/app");
  }

  const { quick } = await searchParams;
  const roster = await listMembers(supabase);
  const members: MemberOption[] = roster
    .filter((m) => m.user_id !== user.id)
    .map((m) => ({
      userId: m.user_id,
      name: m.users?.display_name || m.users?.email || "Unknown",
      email: m.users?.email ?? "",
      pending: !m.accepted_at,
    }));

  const viewer = {
    userId: user.id,
    name: (user.user_metadata?.full_name as string | undefined) || user.email?.split("@")[0] || "You",
  };

  // QuickCreate carries its own ✕-to-close; the full wizard's first step has
  // no back of its own, so give the page one — the top nav carries no chevron.
  if (quick === "1") {
    return <QuickCreate members={members} viewer={viewer} />;
  }
  return (
    <div>
      <BackLink href="/app/series">Series</BackLink>
      <Wizard members={members} viewer={viewer} />
    </div>
  );
}
