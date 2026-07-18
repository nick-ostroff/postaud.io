import { redirect } from "next/navigation";
import { getViewer, listMembers } from "@/db/queries";
import { profilePhotoUrl } from "@/server/profile/photo-url";
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
      photoUrl: profilePhotoUrl(m.users?.avatar_path),
    }));

  // The viewer's own roster row carries their live display name and headshot —
  // prefer it over auth metadata, which goes stale after a profile edit.
  const viewerRow = roster.find((m) => m.user_id === user.id);
  const viewer = {
    userId: user.id,
    name:
      viewerRow?.users?.display_name ||
      (user.user_metadata?.full_name as string | undefined) ||
      user.email?.split("@")[0] ||
      "You",
    photoUrl: profilePhotoUrl(viewerRow?.users?.avatar_path),
  };

  if (quick === "1") {
    return <QuickCreate members={members} viewer={viewer} />;
  }
  return <Wizard members={members} viewer={viewer} />;
}
