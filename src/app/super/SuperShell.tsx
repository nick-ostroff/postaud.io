import Link from "next/link";
import { OpNav } from "./OpNav";

export function SuperShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0b0b0c]">
      {/* Dark operator header (.op-head in Postaudio Superadmin.dc.html) —
          deliberately distinct from the warm/light app chrome so it's always
          obvious an operator is looking at metadata, not their own account. */}
      <header className="bg-[#211E1A]">
        <div className="flex w-full items-center gap-5 px-6 py-3.5 md:px-9">
          <Link href="/super" className="flex items-center text-[17px] font-serif text-[#F7F5F0]">
            post<b className="font-semibold text-[#8FE0BE]">aud</b>.io
          </Link>
          <span className="rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#211E1A] bg-[#8FE0BE]">
            Operator
          </span>
          <OpNav />
          <Link href="/app" className="ml-auto text-[13px] font-medium text-white/55 hover:text-[#F7F5F0]">
            ← Back to app
          </Link>
        </div>
      </header>
      <main className="w-full px-6 pb-14 pt-8 md:px-9">{children}</main>
    </div>
  );
}
