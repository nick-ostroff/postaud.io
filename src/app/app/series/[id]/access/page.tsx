import { redirect } from "next/navigation";

type Params = Promise<{ id: string }>;

/** Access management moved into the series settings page — keep old links working. */
export default async function SeriesAccessPage({ params }: { params: Params }) {
  const { id } = await params;
  redirect(`/app/series/${id}/settings`);
}
