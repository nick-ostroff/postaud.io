import { redirect } from "next/navigation";
import { createClient } from "@/db/server";
import { getSeriesForUser } from "@/db/queries";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { AcceptForm } from "./AcceptForm";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  interviewer: "Interviewer",
  viewer: "Viewer",
};

export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/welcome");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("organization_id, role, accepted_at")
    .eq("user_id", user.id)
    .limit(1);
  const membership = memberships?.[0];

  // No membership at all, or already accepted — nothing to do here.
  if (!membership || membership.accepted_at) redirect("/app");

  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", membership.organization_id)
    .maybeSingle();

  const series = await getSeriesForUser(supabase);
  const orgName = organization?.name ?? "the workspace";

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 py-12">
      <Card className="w-full max-w-[460px] px-9 py-8">
        <div className="serif text-[20px]">
          post<b className="font-semibold text-green-deep">aud</b>.io
        </div>

        <div className="mt-5 flex items-start gap-3.5">
          <Avatar name={orgName} size="lg" />
          <div>
            <div className="serif text-[19px] leading-snug">
              You&apos;ve been invited to join <b>{orgName}</b>.
            </div>
            <div className="mt-1 text-[13px] text-muted">{user.email}</div>
          </div>
        </div>

        <div className="my-5 flex items-center gap-2 text-[13px] text-muted">
          You&apos;ll join as <Badge tone="green">{ROLE_LABELS[membership.role] ?? membership.role}</Badge>
        </div>

        {series.length > 0 && (
          <div className="mb-[22px] overflow-hidden rounded-sm border border-line">
            {series.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 border-b border-line bg-card px-3.5 py-3 last:border-b-0"
              >
                <div>
                  <div className="serif text-[15px]">{s.title}</div>
                  <div className="mt-0.5 text-[11.5px] text-faint">{s.subject_name}</div>
                </div>
                <Badge tone={s.subject_user_id === user.id ? "amber" : "muted"}>
                  {s.subject_user_id === user.id ? "Your series — subject" : "Can view"}
                </Badge>
              </div>
            ))}
          </div>
        )}

        <AcceptForm />

        <p className="mt-4 text-[12px] leading-relaxed text-faint">
          {series.length > 0
            ? "You'll see the series above, plus anything else you're given access to later."
            : "You won't see any series yet — you'll get access as soon as it's shared with you."}{" "}
          Workspace billing, members, and other series stay hidden unless you&apos;re made an admin.
        </p>
      </Card>
    </main>
  );
}
