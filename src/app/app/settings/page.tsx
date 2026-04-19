import { mockOrg } from "@/lib/mocks";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">Settings</h1>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Workspace-level preferences.</p>

      <section className="mt-8 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] p-5 shadow-sm transition-colors">
        <h2 className="text-sm font-medium tracking-wide text-neutral-500 dark:text-neutral-400 uppercase">Workspace</h2>
        <label className="mt-3 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Name</label>
        <input
          defaultValue={mockOrg.name}
          className="mt-1 w-full max-w-md rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:border-neutral-900 dark:focus:border-neutral-500 focus:outline-none transition-colors"
        />
      </section>

      <section className="mt-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] p-5 shadow-sm transition-colors">
        <h2 className="text-sm font-medium tracking-wide text-neutral-500 dark:text-neutral-400 uppercase">Recording retention</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">How long to keep call recordings before auto-deletion.</p>
        <div className="mt-3 flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              className={
                "rounded-md border px-4 py-1.5 text-sm transition-colors " +
                (d === 90
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-[#1c1c1e] dark:text-neutral-300 dark:hover:bg-neutral-800")
              }
            >
              {d} days
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-[#111] p-5 shadow-sm transition-colors">
        <h2 className="text-sm font-medium tracking-wide text-rose-600 dark:text-rose-400 uppercase">Danger zone</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Permanently delete this workspace and all of its data.</p>
        <button className="mt-3 rounded-md border border-rose-300 dark:border-rose-800 bg-white dark:bg-[#1c1c1e] px-4 py-1.5 text-sm text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors">
          Delete workspace
        </button>
      </section>
    </div>
  );
}
