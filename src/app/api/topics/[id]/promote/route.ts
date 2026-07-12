import { NextResponse } from "next/server";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";

type Params = Promise<{ id: string }>;

// POST /api/topics/[id]/promote — moves a suggested topic into the queue:
// suggested → false, position → max(position)+1 for its series. Guarded by
// "can interview this series, or admin" (Task 7 + reused by Task 14's
// after-session flow). `topics` RLS ("topics admin", 0005) only grants
// UPDATE to org admins, so a non-admin interviewer's write has to go
// through the service client — gated by the explicit can-interview check
// below rather than relying on RLS to enforce it for that case.
export async function POST(_request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { user, supabase, organization, role } = await getViewer();
  if (!organization) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: topic, error: topicErr } = await supabase
    .from("topics")
    .select("id, series_id")
    .eq("id", id)
    .maybeSingle();
  if (topicErr) {
    return NextResponse.json({ error: topicErr.message }, { status: 500 });
  }
  if (!topic) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const isAdmin = role === "admin";
  let canInterview = isAdmin;
  if (!canInterview) {
    const { data: series } = await supabase
      .from("series")
      .select("subject_user_id")
      .eq("id", topic.series_id)
      .maybeSingle();
    canInterview = series?.subject_user_id === user.id;
  }
  if (!canInterview) {
    const { data: access } = await supabase
      .from("series_access")
      .select("can_interview")
      .eq("series_id", topic.series_id)
      .eq("user_id", user.id)
      .maybeSingle();
    canInterview = !!access?.can_interview;
  }
  if (!canInterview) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const writer = isAdmin ? supabase : serviceClient();

  const { data: maxRow, error: maxErr } = await writer
    .from("topics")
    .select("position")
    .eq("series_id", topic.series_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) {
    return NextResponse.json({ error: maxErr.message }, { status: 500 });
  }
  const nextPosition = (maxRow?.position ?? 0) + 1;

  const { error: updateErr } = await writer
    .from("topics")
    .update({ suggested: false, position: nextPosition })
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
