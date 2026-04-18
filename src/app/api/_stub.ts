import { NextResponse } from "next/server";

/** Uniform "not implemented" JSON response for route stubs. */
export function notImplemented(spec: string) {
  return NextResponse.json(
    { error: { code: "not_implemented", message: `TODO: ${spec}` } },
    { status: 501 },
  );
}
