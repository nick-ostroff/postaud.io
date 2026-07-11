import { NextResponse } from "next/server";

// GET+POST /api/jobs/tick — invoked by Vercel Cron.
// Stub for the V1 rebuild — real sweep logic lands in Task 13.
export async function GET() {
  return NextResponse.json({ ok: true, swept: 0 });
}

export async function POST() {
  return NextResponse.json({ ok: true, swept: 0 });
}
