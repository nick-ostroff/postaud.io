import { notFound } from "next/navigation";
import { isPlatformAdmin } from "@/lib/auth/is-platform-admin";
import { AdminShell } from "./AdminShell";

export const metadata = { title: "Admin — PostAud.io" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Defense-in-depth: middleware already 404s non-admins, but don't trust it.
  if (!(await isPlatformAdmin())) {
    notFound();
  }
  return <AdminShell>{children}</AdminShell>;
}
