import type { SupabaseClient } from "@supabase/supabase-js";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { canInterviewSeries } from "@/server/interviews/access";
import type { Database, InterviewStatus } from "@/db/types";

export type AuthorizedInterview = {
  /** Service-role client — permission is already verified, so writes bypass RLS. */
  svc: SupabaseClient<Database>;
  organizationId: string;
  interview: {
    id: string;
    series_id: string;
    status: InterviewStatus;
    organization_id: string;
  };
};

/**
 * Thrown by `authorizeInterview` with the exact HTTP status + JSON body the
 * route should return, so each route is a thin try/catch around the guard.
 */
export class InterviewAuthError extends Error {
  status: number;
  body: { error: string };
  constructor(status: number, error: string) {
    super(error);
    this.name = "InterviewAuthError";
    this.status = status;
    this.body = { error };
  }
}

/**
 * Shared guard for the interview sub-routes (messages / audio / complete):
 * loads the interview + its parent series via the service client, confirms it
 * belongs to the caller's org, and runs the same manual `canInterviewSeries`
 * check the token-mint route uses (Task 9). Returns the service client + the
 * interview so the route can proceed with writes.
 *
 * The service client is used for the loads (not the caller's RLS-bound client)
 * for the same reason Task 9 documented: `interviews` SELECT vs INSERT policies
 * key off different `series_access` flags, so we gate at the app layer with an
 * explicit permission check instead of relying on the two policies staying in
 * lockstep.
 */
export async function authorizeInterview(
  interviewId: string,
  opts?: { requireInProgress?: boolean },
): Promise<AuthorizedInterview> {
  const { user, supabase, organization, role } = await getViewer();
  if (!organization) throw new InterviewAuthError(403, "Forbidden");

  const svc = serviceClient();

  const { data: interview, error: interviewErr } = await svc
    .from("interviews")
    .select("id, series_id, status, organization_id")
    .eq("id", interviewId)
    .maybeSingle();
  if (interviewErr) throw new InterviewAuthError(500, interviewErr.message);
  if (!interview || interview.organization_id !== organization.id) {
    throw new InterviewAuthError(404, "not_found");
  }

  const { data: series, error: seriesErr } = await svc
    .from("series")
    .select("id, subject_user_id")
    .eq("id", interview.series_id)
    .maybeSingle();
  if (seriesErr) throw new InterviewAuthError(500, seriesErr.message);
  if (!series) throw new InterviewAuthError(404, "not_found");

  const canInterview = await canInterviewSeries(supabase, {
    userId: user.id,
    role,
    seriesSubjectUserId: series.subject_user_id,
    seriesId: series.id,
  });
  if (!canInterview) throw new InterviewAuthError(403, "Forbidden");

  if (opts?.requireInProgress && interview.status !== "in_progress") {
    throw new InterviewAuthError(409, "not_in_progress");
  }

  return { svc, organizationId: organization.id, interview };
}
