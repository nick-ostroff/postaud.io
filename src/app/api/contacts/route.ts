import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";

const ContactInput = z.object({
  first_name: z.string().min(1).max(80).optional().nullable(),
  last_name: z.string().max(80).optional().nullable(),
  phone_e164: z.string().regex(/^\+[1-9]\d{7,14}$/, "Must be E.164 format, e.g. +15555551234"),
  email: z.string().email().optional().nullable().or(z.literal("")),
});

export async function GET() {
  const { supabase } = await getViewer();
  const { data, error } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone_e164, email, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: { code: "db_error", message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ contacts: data });
}

export async function POST(req: Request) {
  const { supabase, organization } = await getViewer();
  if (!organization) {
    return NextResponse.json({ error: { code: "no_org" } }, { status: 400 });
  }

  const raw = await req.json();
  const parsed = ContactInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_error", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      organization_id: organization.id,
      phone_e164: body.phone_e164,
      first_name: body.first_name ?? null,
      last_name: body.last_name ?? null,
      email: body.email || null,
    })
    .select("id, first_name, last_name, phone_e164, email")
    .single();

  if (error) {
    // Unique-constraint violation on (org, phone) surfaces as 23505.
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: { code: "duplicate", message: "That phone number is already in your contacts." } },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: { code: "insert_failed", message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ contact: data }, { status: 201 });
}
