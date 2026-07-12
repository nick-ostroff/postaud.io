import type { MemberRole } from "@/db/types";

/** Canonical display labels for workspace member roles — single source of truth
 * so `/app/members`, `/welcome`, and `/app`'s layout don't drift out of sync. */
export const ROLE_LABELS: Record<MemberRole, string> = {
  admin: "Admin",
  interviewer: "Interviewer",
  viewer: "Viewer",
};
