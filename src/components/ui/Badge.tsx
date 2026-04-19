import type { SendStatus } from "@/lib/mocks";

const styles: Record<SendStatus | "default", string> = {
  sent:       "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30",
  reminded:   "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  completed:  "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  partial:    "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/30",
  failed:     "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
  declined:   "bg-neutral-100 text-neutral-600 ring-neutral-200 dark:bg-neutral-500/10 dark:text-neutral-300 dark:ring-neutral-500/30",
  expired:    "bg-neutral-100 text-neutral-500 ring-neutral-200 dark:bg-neutral-500/10 dark:text-neutral-400 dark:ring-neutral-500/30",
  cancelled:  "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
  default:    "bg-neutral-100 text-neutral-700 ring-neutral-200 dark:bg-neutral-500/10 dark:text-neutral-300 dark:ring-neutral-500/30",
};

export function StatusBadge({ status }: { status: SendStatus }) {
  const s = styles[status] ?? styles.default;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s}`}
    >
      {status}
    </span>
  );
}
