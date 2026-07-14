import { notFound } from "next/navigation";
import { platformAdminEmail } from "@/lib/auth/is-platform-admin";
import { SuperShell } from "./SuperShell";

export const metadata = { title: "Operator — PostAud.io" };

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  // Defense-in-depth: middleware already 404s non-admins, but don't trust it.
  // platformAdminEmail() does the same auth.getUser() + allowlist check as
  // isPlatformAdmin() and hands back the email SuperShell needs for the
  // operator-identity block, so one Supabase round trip covers both.
  const operatorEmail = await platformAdminEmail();
  if (!operatorEmail) {
    notFound();
  }
  return <SuperShell operatorEmail={operatorEmail}>{children}</SuperShell>;
}
