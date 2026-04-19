import { NextResponse } from "next/server";
import { createClient } from "@/db/server";
import { env } from "@/lib/env";

export async function POST() {
  const origin = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}
