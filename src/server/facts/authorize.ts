import type { SupabaseClient } from "@supabase/supabase-js";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { canInterviewSeries } from "@/server/interviews/access";
import type { Database, Fact } from "@/db/types";

export type AuthorizedFact = {
  /** Service-role client — permission is already verified, so writes bypass RLS. */
  svc: SupabaseClient<Database>;
  organizationId: string;
  userId: string;
  fact: Fact;
};

/**
 * Thrown by `authorizeFact` with the exact HTTP status + JSON body the route
 * should return, so each route is a thin try/catch around the guard —
 * matches the shape of `InterviewAuthError` (src/server/interviews/authorize.ts).
 */
export class FactAuthError extends Error {
  status: number;
  body: { error: string };
  constructor(status: number, error: string) {
    super(error);
    this.name = "FactAuthError";
    this.status = status;
    this.body = { error };
  }
}

/**
 * Shared guard for the Task 15 review routes (PATCH confirm/correct/retell,
 * GET audio-url): loads the fact + its parent series via the service client,
 * confirms it belongs to the caller's org, and runs the same manual
 * `canInterviewSeries` check `authorizeInterview` uses — caller must be the
 * series' subject, an org admin, or hold explicit `can_interview` access.
 * Facts are scoped to a series the same way interviews are, so this mirrors
 * `authorizeInterview` closely rather than introducing a new access model.
 *
 * Uses the service client for the loads (not the caller's RLS-bound client)
 * for the same reason `authorizeInterview` documents: the `facts` RLS
 * ("facts review") already keys off `can_interview_series`, but gating at
 * the app layer with an explicit check keeps the 404-vs-403 distinction
 * precise (cross-org lookups 404, same-org-no-permission 403) instead of
 * relying on RLS to silently return zero rows either way.
 */
export async function authorizeFact(factId: string): Promise<AuthorizedFact> {
  const { user, supabase, organization, role } = await getViewer();
  if (!organization) throw new FactAuthError(403, "Forbidden");

  const svc = serviceClient();

  const { data: fact, error: factErr } = await svc.from("facts").select("*").eq("id", factId).maybeSingle();
  if (factErr) throw new FactAuthError(500, factErr.message);
  if (!fact) throw new FactAuthError(404, "not_found");

  const { data: series, error: seriesErr } = await svc
    .from("series")
    .select("id, organization_id, subject_user_id")
    .eq("id", fact.series_id)
    .maybeSingle();
  if (seriesErr) throw new FactAuthError(500, seriesErr.message);
  if (!series || series.organization_id !== organization.id) throw new FactAuthError(404, "not_found");

  const canAct = await canInterviewSeries(supabase, {
    userId: user.id,
    role,
    seriesSubjectUserId: series.subject_user_id,
    seriesId: series.id,
  });
  if (!canAct) throw new FactAuthError(403, "Forbidden");

  return { svc, organizationId: organization.id, userId: user.id, fact };
}
