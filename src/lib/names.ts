/**
 * First token of a display name — or of the local part of an email address,
 * if that's what's passed — for warm, personal copy that addresses someone
 * by first name only (e.g. the interviewee home's "Sam would love to hear
 * about …" prompt). Returns null for empty/whitespace-only input.
 */
export function firstNameOf(nameOrEmail: string | null | undefined): string | null {
  if (!nameOrEmail) return null;
  const base = nameOrEmail.includes("@") ? nameOrEmail.split("@")[0] : nameOrEmail;
  const first = base.trim().split(/\s+/)[0];
  return first || null;
}
