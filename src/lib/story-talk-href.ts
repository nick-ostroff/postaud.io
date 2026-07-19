/**
 * The Talk destination for a series: stories whose subject has no account go
 * through the hand-the-mic flow; the rest go straight to the live interview.
 *
 * Lives outside StoryBar.tsx on purpose: that file is a client module, so its
 * exports are client references — a server component (the series segment
 * layout) importing this helper from there and CALLING it would throw at
 * render time. Plain shared module = callable from both worlds.
 */
export function storyTalkHref(
  seriesId: string,
  subjectUserId: string | null,
): string {
  return subjectUserId == null
    ? `/app/series/${seriesId}/handoff`
    : `/app/series/${seriesId}/interview`;
}
