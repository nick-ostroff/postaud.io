import { redirect } from "next/navigation";
import { createClient } from "@/db/server";
import { getSeriesForUser } from "@/db/queries";
import { LogoLockup } from "@/components/nav/LogoMark";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ROLE_LABELS } from "@/lib/roles";
import { AcceptForm } from "./AcceptForm";

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
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-paper px-6 py-12">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-[150px] left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.52_0.06_165_/_0.14)_0%,transparent_68%)]"
      />

      <div className="relative w-full max-w-[420px]">
        <LogoLockup />

        {/* The context card (mockup 6b): who invited you and what you're
            getting, before you're asked for anything. */}
        <Card className="mt-[18px] px-5 py-5">
          <div className="flex items-center gap-3">
            <Avatar name={orgName} size="lg" />
            <div className="text-sm leading-snug text-ink-soft">
              You&apos;ve been invited to <b className="text-ink">{orgName}</b> as{" "}
              <Badge tone="green">{ROLE_LABELS[membership.role] ?? membership.role}</Badge>
              <div className="mt-0.5 text-xs text-muted">{user.email}</div>
            </div>
          </div>

          {series.map((s) => (
            <div key={s.id} className="mt-3.5 flex items-center gap-3 border-t border-line pt-3.5">
              <Avatar name={s.subject_name} tone="warm" />
              <div className="min-w-0">
                <div className="serif truncate text-[15px]">{s.title}</div>
                <div className="text-xs text-muted">
                  {s.subject_user_id === user.id ? "you'll be the storyteller" : "you can listen"}
                </div>
              </div>
            </div>
          ))}
        </Card>

        <div className="mt-[18px]">
          <AcceptForm orgId={membership.organization_id} />
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-faint">
          {series.length > 0
            ? "You'll see the story above, plus anything else shared with you later."
            : "You won't see any stories yet — you'll get access as soon as one is shared with you."}{" "}
          Workspace billing, members, and other stories stay hidden unless you&apos;re made an admin.
        </p>

        <form action="/auth/sign-out" method="POST" className="mt-4 text-center">
          <button className="text-[12.5px] text-muted hover:text-ink">Not you? Sign out</button>
        </form>
      </div>
    </main>
  );
}
