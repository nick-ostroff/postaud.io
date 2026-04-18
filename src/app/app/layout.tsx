import Link from "next/link";

const navItems = [
  { href: "/app",                label: "Dashboard" },
  { href: "/app/templates",      label: "Templates" },
  { href: "/app/contacts",       label: "Contacts" },
  { href: "/app/sends",          label: "Sends" },
  { href: "/app/settings",       label: "Settings" },
  { href: "/app/settings/billing", label: "Billing" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r bg-neutral-50">
        <div className="px-4 py-5 text-lg font-semibold">PostAud.io</div>
        <nav className="flex flex-col gap-1 px-2 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 hover:bg-neutral-200"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
