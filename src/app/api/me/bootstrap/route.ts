import { NextResponse } from "next/server";
import { getViewer } from "@/db/queries";

// POST /api/me/bootstrap — idempotent. Ensures users + default org +
// membership exist for the current session (see getViewer's self-heal path).
export async function POST() {
  const { organization, role } = await getViewer();
  return NextResponse.json({ ok: true, organization, role });
}
