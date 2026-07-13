import { notFound } from "next/navigation";
import { isPlatformAdmin } from "@/lib/auth/is-platform-admin";
import { SuperShell } from "./SuperShell";

export const metadata = { title: "Operator — PostAud.io" };

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  // Defense-in-depth: middleware already 404s non-admins, but don't trust it.
  if (!(await isPlatformAdmin())) {
    notFound();
  }
  return <SuperShell>{children}</SuperShell>;
}
