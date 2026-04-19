import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";

const ContactUpdate = z.object({
  first_name: z.string().max(80).optional().nullable(),
  last_name: z.string().max(80).optional().nullable(),
  phone_e164: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
  email: z.string().email().optional().nullable().or(z.literal("")),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { supabase } = await getViewer();

  const raw = await req.json();
  const parsed = ContactUpdate.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "validation_error", details: parsed.error.flatten() } }, { status: 400 });
  }

  const { error } = await supabase.from("contacts").update(parsed.data).eq("id", id);
  if (error) {
    return NextResponse.json({ error: { code: "update_failed", message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ id });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { supabase } = await getViewer();

  // Referential: interview_requests.contact_id has ON DELETE RESTRICT.
  // Surface the FK violation as a friendly 409.
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) {
    if ((error as { code?: string }).code === "23503") {
      return NextResponse.json(
        { error: { code: "has_sends", message: "Contact is referenced by existing sends and can't be deleted." } },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: { code: "delete_failed", message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ id, deleted: true });
}
