import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { SERIES_AVATAR_BUCKET } from "@/server/series/photo-url";

type Params = Promise<{ id: string }>;

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — the cropper already downsizes to ~512px webp

// The cropper always emits webp; still allow the common source types in case a
// caller posts an original, and map each to its stored extension.
const CONTENT_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * POST /api/series/[id]/photo — stores the subject photo for a series.
 *
 * Body is the raw image bytes (the client crops + encodes to webp first).
 * Admin-only and org-scoped like PATCH /api/series/[id]. Writes to the public
 * `series-avatars` bucket via the service role, then records `photo_path` on
 * the row. Each upload gets a fresh uuid filename so the public URL changes on
 * replace (CDN cache-bust); the prior object is deleted best-effort.
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { supabase, organization, role } = await getViewer();
  if (!organization || role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = CONTENT_TYPES[contentType];
  if (!ext) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.byteLength === 0) {
    return NextResponse.json({ error: "empty_body" }, { status: 400 });
  }
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  // Confirm the series is in the caller's org before writing (RLS on the
  // update below would also reject a foreign row, but this returns a clean 404
  // and gives us the old path to clean up).
  const { data: existing, error: readErr } = await supabase
    .from("series")
    .select("photo_path")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const svc = serviceClient();
  const path = `${organization.id}/${id}/${randomUUID()}.${ext}`;

  const { error: uploadErr } = await svc.storage.from(SERIES_AVATAR_BUCKET).upload(path, buf, {
    contentType,
    upsert: true,
  });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from("series")
    .update({ photo_path: path })
    .eq("id", id)
    .eq("organization_id", organization.id);
  if (updateErr) {
    // Roll back the orphaned upload so a failed row-update doesn't leave a
    // dangling object behind.
    await svc.storage.from(SERIES_AVATAR_BUCKET).remove([path]);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Prior photo is now unreferenced — remove it (best-effort; a leftover
  // object is harmless).
  if (existing.photo_path && existing.photo_path !== path) {
    await svc.storage.from(SERIES_AVATAR_BUCKET).remove([existing.photo_path]);
  }

  return NextResponse.json({ ok: true, photoPath: path });
}
