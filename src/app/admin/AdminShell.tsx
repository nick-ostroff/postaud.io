import Link from "next/link";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0b0b0c]">
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111]">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-semibold text-neutral-900 dark:text-white">
              PostAud.io Admin
            </Link>
            <nav className="flex items-center gap-4 text-[14px] font-medium text-neutral-600 dark:text-neutral-400">
              <Link href="/admin/accounts" className="hover:text-neutral-900 dark:hover:text-white">
                Accounts
              </Link>
            </nav>
          </div>
          <Link
            href="/app"
            className="text-[13px] font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            ← Back to app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
