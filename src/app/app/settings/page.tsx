import { mockOrg } from "@/lib/mocks";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-neutral-600">Workspace-level preferences.</p>

      <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-medium tracking-wide text-neutral-500 uppercase">Workspace</h2>
        <label className="mt-3 block text-xs font-medium text-neutral-600">Name</label>
        <input
          defaultValue={mockOrg.name}
          className="mt-1 w-full max-w-md rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </section>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-medium tracking-wide text-neutral-500 uppercase">Recording retention</h2>
        <p className="mt-1 text-sm text-neutral-600">How long to keep call recordings before auto-deletion.</p>
        <div className="mt-3 flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              className={
                "rounded-md border px-4 py-1.5 text-sm " +
                (d === 90
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50")
              }
            >
              {d} days
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-rose-200 bg-white p-5">
        <h2 className="text-sm font-medium tracking-wide text-rose-600 uppercase">Danger zone</h2>
        <p className="mt-1 text-sm text-neutral-600">Permanently delete this workspace and all of its data.</p>
        <button className="mt-3 rounded-md border border-rose-300 bg-white px-4 py-1.5 text-sm text-rose-700 hover:bg-rose-50">
          Delete workspace
        </button>
      </section>
    </div>
  );
}
