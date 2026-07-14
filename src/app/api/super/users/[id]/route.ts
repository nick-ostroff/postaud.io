import { NextResponse, type NextRequest } from "next/server";
import { platformAdminEmail } from "@/lib/auth/is-platform-admin";
import { getPlatformUserDetail } from "@/db/queries/admin";

type Params = Promise<{ id: string }>;

/**
 * Backs the dashboard's slide-in detail panel (DashboardUsers.tsx): fetched
 * client-side on row click. Metadata only — see getPlatformUserDetail.
 *
 * Admin surfaces 404, never 403/401, so existence isn't disclosed — mirrors
 * /api/super/impersonate.
 */
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const adminEmail = await platformAdminEmail();
  if (!adminEmail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { id } = await params;
  const detail = await getPlatformUserDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
