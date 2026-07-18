import Link from "next/link";

/**
 * In-content back link ("‹ Series") used at the top of every screen below a
 * root section. This is the app's only back affordance — the mobile top nav
 * deliberately carries no chevron so its layout never shifts.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-block text-[13px] font-medium text-muted hover:text-ink">
      ‹ {children}
    </Link>
  );
}
