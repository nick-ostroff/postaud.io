import { redirect } from "next/navigation";

// The users/accounts console now lives at /admin (see AdminShell's Users
// nav item) — keep this route as a redirect for any bookmarked links.
export default function AccountsListRedirect() {
  redirect("/admin");
}
