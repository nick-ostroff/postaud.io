import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { PROFILE_AVATAR_BUCKET } from "@/server/profile/photo-url";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — the cropper already downsizes to ~512px webp

// The cropper always emits webp; still allow the common source types in case a
// caller posts an original, and map each to its stored extension.
const CONTENT_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * POST /api/profile/photo — stores the current user's headshot.
 *
 * Body is the raw image bytes (the client crops + encodes to webp first). Any
 * signed-in user may set their own photo. Writes to the public
 * `profile-avatars` bucket via the service role, then records `avatar_path` in
 * auth `user_metadata`. Each upload gets a fresh uuid filename so the public
 * URL changes on replace (CDN cache-bust); the prior object is deleted
 * best-effort. Mirrors POST /api/series/[id]/photo.
 */
export async function POST(request: Request) {
  const { user, supabase } = await getViewer();

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

  const svc = serviceClient();
  const path = `${user.id}/${randomUUID()}.${ext}`;

  const { error: uploadErr } = await svc.storage.from(PROFILE_AVATAR_BUCKET).upload(path, buf, {
    contentType,
    upsert: true,
  });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const oldPath = (user.user_metadata?.avatar_path as string | undefined) ?? null;
  const { error: updateErr } = await supabase.auth.updateUser({ data: { avatar_path: path } });
  if (updateErr) {
    // Roll back the orphaned upload so a failed metadata write doesn't leave a
    // dangling object behind.
    await svc.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Mirror onto `public.users` so roster joins (series "Who's involved",
  // access page, members page) see the photo too — auth metadata isn't
  // joinable from those queries. Best-effort ordering matches the metadata
  // write above; a failure here would strand only the mirror, so surface it.
  const { error: mirrorErr } = await svc.from("users").update({ avatar_path: path }).eq("id", user.id);
  if (mirrorErr) {
    return NextResponse.json({ error: mirrorErr.message }, { status: 500 });
  }

  // Prior photo is now unreferenced — remove it (best-effort; a leftover
  // object is harmless).
  if (oldPath && oldPath !== path) {
    await svc.storage.from(PROFILE_AVATAR_BUCKET).remove([oldPath]);
  }

  return NextResponse.json({ ok: true, photoPath: path });
}
