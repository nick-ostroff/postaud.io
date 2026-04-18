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
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
      <p className="mt-1 text-sm text-neutral-600">
        You're on the <strong>{mockOrg.plan}</strong> plan.
      </p>

      <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">This cycle</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {mockOrg.credits_remaining}
              <span className="ml-1 text-base font-medium text-neutral-400">/ {mockOrg.credits_total} credits</span>
            </div>
          </div>
          <button className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm hover:bg-neutral-50">
            Open Stripe portal
          </button>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full bg-neutral-900"
            style={{ width: `${(mockOrg.credits_remaining / mockOrg.credits_total) * 100}%` }}
          />
        </div>
      </div>

      <h2 className="mt-10 text-sm font-medium tracking-wide text-neutral-500 uppercase">Plans</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-4">
        {PLANS.map((p) => {
          const current = p.key === mockOrg.plan;
          return (
            <div
              key={p.key}
              className={
                "rounded-xl border bg-white p-5 " +
                (current ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200")
              }
            >
              <div className="text-sm font-medium">{p.name}</div>
              <div className="mt-1 text-2xl font-semibold">{p.price}<span className="text-sm font-normal text-neutral-500">/mo</span></div>
              <div className="mt-1 text-xs text-neutral-500">{p.blurb}</div>
              <div className="mt-4 text-sm">{p.credits} interviews / mo</div>
              <button
                disabled={current}
                className={
                  "mt-4 w-full rounded-md px-3 py-1.5 text-sm font-medium " +
                  (current
                    ? "cursor-not-allowed bg-neutral-100 text-neutral-500"
                    : "bg-neutral-900 text-white hover:bg-neutral-800")
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
