import { Card } from "@/components/ui/Card";
import { getViewer } from "@/db/queries";
import { ROLE_LABELS } from "@/lib/roles";

/**
 * Minimal read-only profile/org card. There's no editable workspace
 * settings yet (name/plan changes go through the platform admin console,
 * not self-serve) — this page just confirms who you are and which
 * workspace you're in, rather than presenting controls that don't save
 * anything.
 */
export default async function SettingsPage() {
  const { user, organization, role } = await getViewer();
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : "Member";

  return (
    <div>
      <h1 className="text-[28px]">Settings</h1>
      <p className="mt-1 text-[13.5px] text-muted">Your profile and workspace.</p>

      <Card className="mt-8 px-[22px] py-5">
        <h3>Profile</h3>
        <dl className="mt-3 flex flex-col gap-2 text-[13.5px]">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Email</dt>
            <dd className="font-medium text-ink">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Role</dt>
            <dd className="font-medium text-ink">{roleLabel}</dd>
          </div>
        </dl>
      </Card>

      {organization && (
        <Card className="mt-4 px-[22px] py-5">
          <h3>Workspace</h3>
          <dl className="mt-3 flex flex-col gap-2 text-[13.5px]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Name</dt>
              <dd className="font-medium text-ink">{organization.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Plan</dt>
              <dd className="font-medium text-ink capitalize">{organization.plan}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Credits remaining</dt>
              <dd className="font-medium text-ink">{organization.credits_remaining}</dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}
