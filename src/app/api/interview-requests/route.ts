import { notImplemented } from "../_stub";

// GET  /api/interview-requests
// POST /api/interview-requests — send one invite.
//      Snapshots template, generates token + dial_code, sends SMS,
//      decrements credit. See plan/04-api-routes.md §4.
export async function GET()  { return notImplemented("list interview requests"); }
export async function POST() { return notImplemented("send interview invite"); }
