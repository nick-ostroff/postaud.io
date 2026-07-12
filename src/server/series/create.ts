import type { SupabaseClient } from "@supabase/supabase-js";
import { listMembers } from "@/db/queries";
import { serviceClient } from "@/db/service";
import type { Database, SeriesTone, SubjectKind } from "@/db/types";
import { InviteMemberError, inviteMember } from "@/server/members/invite";

export type CreateSeriesInput = {
  title: string;
  goal: string;
  subjectKind: SubjectKind;
  subjectUserId?: string;
  subjectName: string;
  subjectRelationship?: string;
  openingPrompt?: string;
  mustCover: string[];
  dontBringUp: string[];
  tone: SeriesTone;
  sessionMinutes: 10 | 20 | 45;
  access: { userId: string; canView: boolean; canInterview: boolean }[];
  inviteSubjectEmail?: string;
  questionPlan?: string[];
};

/**
 * Typed create-series failures the caller (`POST /api/series`) maps to
 * specific HTTP status codes.
 */
export class CreateSeriesError extends Error {
  code: "invalid_subject" | "in_other_workspace";
  status: number;
  constructor(code: CreateSeriesError["code"], message: string, status = 400) {
    super(message);
    this.name = "CreateSeriesError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Truncates to `topics.name`'s effective 60-char convention for question-plan
 * rows and disambiguates against names already used in this batch — `topics`
 * has a `unique (series_id, name)` constraint, so two overlapping questions
 * (or a question that happens to collide with a must-cover chip's exact
 * text) can't both insert with the same name.
 */
function slugName(text: string, used: Set<string>): string {
  const base = text.trim().slice(0, 60) || "Question";
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, Math.max(0, 60 - suffix.length)) + suffix;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Single write path for series creation: inserts `series`, per-member
 * `series_access` rows, and seeds `topics` from `mustCover` (must-cover
 * chips) plus any `questionPlan` (Task 6's drafted first-session questions,
 * kept as non-must-cover topic rows so Task 9's interviewer prompt sees them
 * without a schema change).
 *
 * Uses the caller's request-scoped (RLS-bound) `supabase` client rather than
 * the service client — `series admin` / `access admin` / `topics admin`
 * policies (0005_knowledge_interviewer.sql) already require
 * `is_org_admin() and organization_id = current_org_id()`, so this both
 * writes and double-enforces admin-only in one place. The route handler
 * still checks role explicitly so it can return a clean 403 before ever
 * touching the DB.
 */
export async function createSeries(
  supabase: SupabaseClient<Database>,
  args: { orgId: string; createdBy: string; input: CreateSeriesInput },
): Promise<{ id: string }> {
  const { orgId, createdBy, input } = args;

  // Fetch the roster once — used to validate the subject picker and to drop
  // any access-list entries that aren't (or are no longer) org members.
  const members = await listMembers(supabase);
  const memberIds = new Set(members.map((m) => m.user_id));

  let subjectUserId: string | null = null;
  let subjectName = input.subjectName.trim();

  if (input.subjectKind === "self") {
    subjectUserId = createdBy;
  } else if (input.subjectKind === "member") {
    if (input.subjectUserId) {
      if (!memberIds.has(input.subjectUserId)) {
        throw new CreateSeriesError("invalid_subject", "That member isn't part of this workspace.");
      }
      subjectUserId = input.subjectUserId;
    } else if (input.inviteSubjectEmail) {
      // Inline "someone without an account, invited by email" flow from the
      // wizard's Basics step — send the invite now so the subject has an
      // account to sign in and join their own sessions.
      try {
        const { userId } = await inviteMember({
          email: input.inviteSubjectEmail,
          role: "interviewer",
          orgId,
          invitedBy: createdBy,
        });
        subjectUserId = userId;
      } catch (err) {
        if (err instanceof InviteMemberError && err.code === "already_member") {
          // Someone already invited/accepted this email into the org —
          // reuse them as the subject instead of failing the whole create.
          const svc = serviceClient();
          const { data: existing } = await svc
            .from("users")
            .select("id, display_name")
            .eq("email", input.inviteSubjectEmail)
            .maybeSingle();
          if (!existing) {
            throw new CreateSeriesError("invalid_subject", "Could not resolve the existing member.");
          }
          subjectUserId = existing.id;
          if (!subjectName && existing.display_name) subjectName = existing.display_name;
        } else if (err instanceof InviteMemberError) {
          // "in_other_workspace" — surface as a form error, per the brief.
          throw new CreateSeriesError("in_other_workspace", err.message, 409);
        } else {
          throw err;
        }
      }
    }

    if (!subjectUserId) {
      throw new CreateSeriesError("invalid_subject", "Pick an existing member, or invite one, as the subject.");
    }
  }
  // 'person' | 'organization': subjectUserId stays null; subjectName is the
  // free-text name — they're handed the mic in person later (Task 10).

  const { data: series, error: seriesErr } = await supabase
    .from("series")
    .insert({
      organization_id: orgId,
      title: input.title.trim(),
      subject_kind: input.subjectKind,
      subject_user_id: subjectUserId,
      subject_name: subjectName,
      subject_relationship: input.subjectRelationship?.trim() || null,
      goal: input.goal.trim(),
      opening_prompt: input.openingPrompt?.trim() || null,
      dont_bring_up: input.dontBringUp,
      tone: input.tone,
      session_minutes: input.sessionMinutes,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (seriesErr || !series) {
    throw new Error(seriesErr?.message ?? "Could not create series.");
  }

  // From here on, `series` exists. If anything below fails, best-effort clean
  // up the row we just created (series_access/topics cascade via FK) rather
  // than leaving an orphaned, half-configured series behind — then rethrow so
  // the caller still sees the original failure.
  try {
    const accessRows = input.access
      .filter((a) => memberIds.has(a.userId) && a.userId !== subjectUserId && (a.canView || a.canInterview))
      .map((a) => ({
        series_id: series.id,
        user_id: a.userId,
        can_view: a.canView,
        can_interview: a.canInterview,
      }));
    if (accessRows.length > 0) {
      const { error: accessErr } = await supabase.from("series_access").insert(accessRows);
      if (accessErr) throw new Error(accessErr.message);
    }

    const usedNames = new Set<string>();
    const seenTopicText = new Set<string>();
    const topicRows: Database["public"]["Tables"]["topics"]["Insert"][] = [];

    input.mustCover.forEach((raw, i) => {
      const name = raw.trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seenTopicText.has(key)) return; // dedupe repeated chips
      seenTopicText.add(key);
      usedNames.add(name);
      topicRows.push({
        series_id: series.id,
        name,
        description: null,
        must_cover: true,
        suggested: false,
        position: i,
      });
    });

    (input.questionPlan ?? []).forEach((raw, i) => {
      const text = raw.trim();
      if (!text) return;
      const key = text.toLowerCase();
      if (seenTopicText.has(key)) return; // already a must-cover chip, or a dup question
      seenTopicText.add(key);
      topicRows.push({
        series_id: series.id,
        name: slugName(text, usedNames),
        description: text,
        must_cover: false,
        suggested: false,
        position: input.mustCover.length + i,
      });
    });

    if (topicRows.length > 0) {
      const { error: topicsErr } = await supabase.from("topics").insert(topicRows);
      if (topicsErr) throw new Error(topicsErr.message);
    }
  } catch (err) {
    const { error: cleanupErr } = await supabase.from("series").delete().eq("id", series.id);
    const original = err instanceof Error ? err.message : String(err);
    if (cleanupErr) {
      throw new Error(
        `${original} (additionally, cleanup of orphaned series ${series.id} failed: ${cleanupErr.message})`,
      );
    }
    throw err instanceof Error ? err : new Error(original);
  }

  return { id: series.id };
}
