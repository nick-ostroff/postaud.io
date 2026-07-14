import Link from "next/link";
import { SuperBottomBar, SuperSidebarNav } from "./SuperNav";
import { SuperMobileMenu } from "./SuperMobileMenu";

/** postaud.io wordmark + bars-glyph, shared by the desktop sidebar and the
 *  mobile header (Postaudio Superadmin.dc.html, screens 1a/2a). */
function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-[26px] w-[26px] flex-none items-center justify-center gap-[1.5px] rounded-[7px] bg-green">
        <div className="h-[7px] w-[2px] rounded-[1px] bg-white/55" />
        <div className="h-[12px] w-[2px] rounded-[1px] bg-white/80" />
        <div className="h-[9px] w-[2px] rounded-[1px] bg-white/80" />
        <div className="ml-[1.5px] h-[12px] w-[5px] rounded-[1.5px] bg-white" />
      </div>
      <div className="text-[15.5px] font-semibold tracking-[-0.02em] text-[#F0EDE6]">
        postaud<span className="text-mint">.io</span>
      </div>
    </div>
  );
}

function SuperAdminBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="self-start rounded bg-green px-2 py-[3px] font-mono text-[10px] font-semibold tracking-[0.06em] text-white">
      {children}
    </span>
  );
}

/**
 * Operator console shell: a left dark sidebar on desktop (≥lg), a compact
 * dark header + fixed bottom tab bar + "Sections" overlay on phones (<lg).
 * Replaces the old dark top-bar chrome (see SuperNav/SuperMobileMenu for the
 * interactive nav pieces — both "use client" for usePathname/useState).
 */
export function SuperShell({
  children,
  operatorEmail,
}: {
  children: React.ReactNode;
  operatorEmail: string;
}) {
  const initial = operatorEmail ? operatorEmail[0]!.toUpperCase() : "S";

  return (
    <div className="bg-paper lg:grid lg:min-h-screen lg:grid-cols-[230px_1fr]">
      {/* Desktop sidebar (≥lg) */}
      <aside className="hidden box-border flex-col bg-dark px-4 py-5 text-[#F0EDE6] lg:flex">
        <Link href="/super" className="self-start">
          <Wordmark />
        </Link>
        <div className="mb-[18px] mt-[14px]">
          <SuperAdminBadge>SUPER ADMIN</SuperAdminBadge>
        </div>

        <SuperSidebarNav />

        <div className="mt-auto flex items-center gap-[9px] px-1 py-1.5">
          <div className="grid h-7 w-7 flex-none place-items-center rounded-full bg-green/25 text-[11px] font-semibold text-mint">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#F0EDE6]">Operator</div>
            <div className="truncate text-[10.5px] text-[rgba(240,237,230,0.5)]">{operatorEmail}</div>
          </div>
        </div>
        <Link
          href="/app"
          className="mt-3 text-[12px] font-medium text-[rgba(240,237,230,0.55)] hover:text-[#F0EDE6]"
        >
          ← Back to app
        </Link>
      </aside>

      {/* Mobile header (<lg) */}
      <header className="flex items-center gap-3 bg-[#1B1814] px-4 py-3 lg:hidden">
        <Link href="/super">
          <Wordmark />
        </Link>
        <SuperAdminBadge>SUPER</SuperAdminBadge>
        <SuperMobileMenu operatorEmail={operatorEmail} />
      </header>

      {/* Content — a rounded "paper sheet" under the dark mobile header;
          plain full-height panel on desktop. */}
      <main className="min-h-0 rounded-t-[20px] bg-paper px-5 py-6 pb-28 lg:rounded-none lg:px-7 lg:py-6 lg:pb-6">
        {children}
      </main>

      {/* Mobile bottom tab bar (<lg) */}
      <SuperBottomBar />
    </div>
  );
}
