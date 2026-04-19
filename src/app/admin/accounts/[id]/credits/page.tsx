import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationDetail } from "@/db/queries/admin";
import { CreditForm } from "./CreditForm";

type Params = Promise<{ id: string }>;

export default async function CreditAdjustPage({ params }: { params: Params }) {
  const { id } = await params;
  const detail = await getOrganizationDetail(id);
  if (!detail) notFound();

  return (
    <div className="max-w-lg">
      <Link
        href={`/admin/accounts/${id}`}
        className="text-[13px] text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
      >
        ← {detail.organization.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-white">
        Adjust credits
      </h1>
      <p className="mt-1 text-[14px] text-neutral-500">
        Current balance: {detail.organization.credits_remaining}
      </p>
      <div className="mt-6">
        <CreditForm orgId={id} />
      </div>
    </div>
  );
}
