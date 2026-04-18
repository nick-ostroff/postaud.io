import { notImplemented } from "../../_stub";

// GET    /api/templates/:id
// PATCH  /api/templates/:id
// DELETE /api/templates/:id (soft-delete)
// See plan/04-api-routes.md §2.
export async function GET()    { return notImplemented("get template"); }
export async function PATCH()  { return notImplemented("update template"); }
export async function DELETE() { return notImplemented("soft-delete template"); }
