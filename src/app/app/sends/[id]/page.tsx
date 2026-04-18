export default async function SendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <h1 className="text-2xl font-semibold">Send detail</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Request {id}: status, recording, transcript, answers, summary, output, webhook log. TODO.
      </p>
    </div>
  );
}
