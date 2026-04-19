import { mockOrg } from "@/lib/mocks";

const PLANS = [
  { key: "free",    name: "Free",    price: "$0",   credits: 3,   blurb: "Try it out" },
  { key: "starter", name: "Starter", price: "$29",  credits: 20,  blurb: "For solo operators" },
  { key: "growth",  name: "Growth",  price: "$99",  credits: 100, blurb: "Most popular" },
  { key: "scale",   name: "Scale",   price: "$299", credits: 400, blurb: "For teams" },
];

export default function BillingPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">Billing</h1>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        You're on the <strong className="text-neutral-900 dark:text-neutral-100">{mockOrg.plan}</strong> plan.
      </p>

      <div className="mt-8 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] p-5 shadow-sm transition-colors">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">This cycle</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
              {mockOrg.credits_remaining}
              <span className="ml-1 text-base font-medium text-neutral-400 dark:text-neutral-500">/ {mockOrg.credits_total} credits</span>
            </div>
          </div>
          <button className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
            Open Stripe portal
          </button>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className="h-full bg-neutral-900 dark:bg-neutral-100"
            style={{ width: `${(mockOrg.credits_remaining / mockOrg.credits_total) * 100}%` }}
          />
        </div>
      </div>

      <h2 className="mt-10 text-sm font-medium tracking-wide text-neutral-500 dark:text-neutral-400 uppercase">Plans</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-4">
        {PLANS.map((p) => {
          const current = p.key === mockOrg.plan;
          return (
            <div
              key={p.key}
              className={
                "rounded-xl border bg-white dark:bg-[#111] p-5 shadow-sm transition-colors " +
                (current
                  ? "border-neutral-900 ring-1 ring-neutral-900 dark:border-neutral-100 dark:ring-neutral-100"
                  : "border-neutral-200 dark:border-neutral-800")
              }
            >
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{p.name}</div>
              <div className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{p.price}<span className="text-sm font-normal text-neutral-500 dark:text-neutral-400">/mo</span></div>
              <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{p.blurb}</div>
              <div className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">{p.credits} interviews / mo</div>
              <button
                disabled={current}
                className={
                  "mt-4 w-full rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                  (current
                    ? "cursor-not-allowed bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500"
                    : "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200")
                }
              >
                {current ? "Current plan" : "Select"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
