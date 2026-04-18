import { NextResponse } from "next/server";

// POST /api/jobs/tick — invoked by Vercel Cron every minute.
// Pulls up to N ready jobs and dispatches them to /api/jobs/run.
// See plan/04-api-routes.md §9.
export async function POST() {
  // TODO: select jobs where status='pending' and run_after<=now() limit 50;
  //       POST each to /api/jobs/run with HMAC header.
  return NextResponse.json({ picked: 0 });
}
