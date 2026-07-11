import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MemberRole } from "@/db/types";

/**
 * Application-level mirror of the `can_interview_series` RLS function
 * (0005_knowledge_interviewer.sql): org admins, the series' subject, or
 * anyone with an explicit `series_access.can_interview` row. Reused by both
 * the interview-start route and the realtime-token mint route (Task 9),
 * following the same manual check `POST /api/topics/[id]/promote` (Task 7)
 * uses rather than a round-trip through `.rpc()`.
 */
export async function canInterviewSeries(
  supabase: SupabaseClient<Database>,
  args: { userId: string; role: MemberRole | null; seriesSubjectUserId: string | null; seriesId: string },
): Promise<boolean> {
  if (args.role === "admin") return true;
  if (args.seriesSubjectUserId && args.seriesSubjectUserId === args.userId) return true;

  const { data: access } = await supabase
    .from("series_access")
    .select("can_interview")
    .eq("series_id", args.seriesId)
    .eq("user_id", args.userId)
    .maybeSingle();
  return !!access?.can_interview;
}
