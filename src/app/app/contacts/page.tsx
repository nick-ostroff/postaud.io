import { getViewer } from "@/db/queries";
import { ContactsTable } from "./ContactsTable";

export default async function ContactsPage() {
  const { supabase } = await getViewer();
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone_e164, email, created_at")
    .order("created_at", { ascending: false });

  return <ContactsTable initial={contacts ?? []} />;
}
