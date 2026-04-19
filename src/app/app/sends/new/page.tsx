import Link from "next/link";
import { getViewer } from "@/db/queries";
import { NewSendWizard } from "./NewSendWizard";

export default async function NewSendPage() {
  const { supabase, organization } = await getViewer();

  const [{ data: templates }, { data: contacts }] = await Promise.all([
    supabase
      .from("interview_templates")
      .select("id, name, sms_body, output_type")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, phone_e164, email")
      .order("created_at", { ascending: false }),
  ]);

  const hasTemplates = (templates?.length ?? 0) > 0;
  const creditsRemaining = organization?.credits_remaining ?? 0;

  if (!hasTemplates) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New send</h1>
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <div className="text-sm font-medium">You need a template first</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Templates define the questions the AI will ask.
          </p>
          <Link
            href="/app/templates/new"
            className="mt-5 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Create a template
          </Link>
        </div>
      </div>
    );
  }

  return (
    <NewSendWizard
      templates={templates ?? []}
      initialContacts={contacts ?? []}
      creditsRemaining={creditsRemaining}
    />
  );
}
