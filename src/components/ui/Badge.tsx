import type { SendStatus } from "@/lib/mocks";

const styles: Record<SendStatus | "default", string> = {
  sent:       "bg-sky-50    text-sky-700    ring-sky-200",
  reminded:   "bg-amber-50  text-amber-700  ring-amber-200",
  completed:  "bg-emerald-50 text-emerald-700 ring-emerald-200",
  partial:    "bg-orange-50 text-orange-700 ring-orange-200",
  failed:     "bg-rose-50   text-rose-700   ring-rose-200",
  declined:   "bg-neutral-100 text-neutral-600 ring-neutral-200",
  expired:    "bg-neutral-100 text-neutral-500 ring-neutral-200",
  cancelled:  "bg-rose-50   text-rose-700   ring-rose-200",
  default:    "bg-neutral-100 text-neutral-700 ring-neutral-200",
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
