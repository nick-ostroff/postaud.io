import { NextResponse } from "next/server";
import { serviceClient } from "@/db/service";
import { env } from "@/lib/env";
import { sweepOnce } from "@/server/jobs/tick";

/**
 * GET+POST /api/jobs/tick — Vercel Cron hits this every minute
 * (`.vercel/vercel.json`'s `* * * * *`), sending `Authorization: Bearer
 * ${CRON_SECRET}` automatically once that env var is set. POST is kept
 * identical for manual/local runs (`curl -XPOST` with the same header).
 *
 * Sweeps interviews stuck in `completed` (extraction crashed, was never
 * retried, etc.) — see `sweepOnce` for the exact selection criteria.
 */
async function handleTick(request: Request): Promise<NextResponse> {
  const secret = env().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron_disabled" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepOnce(serviceClient());
  return NextResponse.json({ ok: true, swept: result.swept });
}

export async function GET(request: Request) {
  return handleTick(request);
}

export async function POST(request: Request) {
  return handleTick(request);
}
