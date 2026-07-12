/**
 * Series knowledge → Markdown, for Task 16's "take it with you" export.
 * Pure by design (plain data in → string out, no I/O) so it's cheap to unit
 * test with fixtures — the route (`/api/series/[id]/export`) is responsible
 * for fetching + shaping the data and for the `.txt` variant.
 */

export type SeriesExportScope = {
  summaries: boolean;
  facts: boolean;
  entities: boolean;
  timeline: boolean;
  transcripts: boolean;
};

export type SeriesExportFact = {
  statement: string;
  /** e.g. "Session 3", or a fallback like "Manual entry" for facts with no source interview. */
  sessionLabel: string;
  /** MM:SS into the session's recording, or null when the fact has no recorded offset. */
  timestamp: string | null;
};

export type SeriesExportTopicGroup = {
  topic: string;
  facts: SeriesExportFact[];
};

export type SeriesExportPerson = {
  name: string;
  detail?: string;
};

export type SeriesExportTimelineEntry = {
  label: string;
  statement: string;
};

export type SeriesExportTranscriptTurn = {
  role: string;
  text: string;
};

export type SeriesExportTranscript = {
  sessionLabel: string;
  turns: SeriesExportTranscriptTurn[];
};

export type SeriesExportInput = {
  series: { title: string; subjectName: string; goal: string };
  summaries: { short: string; date: string }[];
  factsByTopic: SeriesExportTopicGroup[];
  people: SeriesExportPerson[];
  places: string[];
  timeline: SeriesExportTimelineEntry[];
  scope: SeriesExportScope;
  transcripts?: SeriesExportTranscript[];
};

/**
 * Renders one series' knowledge base as a Markdown document. Section order:
 * title → summary → facts grouped by topic (each with a source line back to
 * the session + audio timestamp) → people → places → timeline → optional
 * transcripts. Each section is entirely omitted (not just emptied) when its
 * `scope` flag is off, or when it has no data to show.
 */
export function renderSeriesMarkdown(input: SeriesExportInput): string {
  const { series, summaries, factsByTopic, people, places, timeline, scope, transcripts } = input;
  const sections: string[] = [];

  sections.push(`# ${series.title}`);
  sections.push(`${series.subjectName} — ${series.goal}`);

  if (scope.summaries && summaries.length > 0) {
    const lines = ["## Summary", ""];
    for (const s of summaries) lines.push(`- ${s.short} (${s.date})`);
    sections.push(lines.join("\n"));
  }

  if (scope.facts) {
    for (const group of factsByTopic) {
      if (group.facts.length === 0) continue;
      const lines = [`## ${group.topic}`, ""];
      for (const fact of group.facts) {
        lines.push(`- ${fact.statement}`);
        const source = fact.timestamp ? `${fact.sessionLabel}, ${fact.timestamp}` : fact.sessionLabel;
        lines.push(`  — ${source}`);
      }
      sections.push(lines.join("\n"));
    }
  }

  if (scope.entities) {
    if (people.length > 0) {
      const lines = ["## People", ""];
      for (const p of people) lines.push(p.detail ? `- **${p.name}** — ${p.detail}` : `- ${p.name}`);
      sections.push(lines.join("\n"));
    }
    if (places.length > 0) {
      const lines = ["## Places", ""];
      for (const place of places) lines.push(`- ${place}`);
      sections.push(lines.join("\n"));
    }
  }

  if (scope.timeline && timeline.length > 0) {
    const lines = ["## Timeline", ""];
    for (const t of timeline) lines.push(`- **${t.label}** — ${t.statement}`);
    sections.push(lines.join("\n"));
  }

  if (scope.transcripts && transcripts && transcripts.length > 0) {
    const lines = ["## Transcripts", ""];
    for (const session of transcripts) {
      lines.push(`### ${session.sessionLabel}`, "");
      for (const turn of session.turns) lines.push(`**${turn.role}:** ${turn.text}`, "");
    }
    sections.push(lines.join("\n").trimEnd());
  }

  return sections.join("\n\n") + "\n";
}

/**
 * Plain-text variant for `?format=txt`: a simple regex pass that strips
 * Markdown's heading/bold/emphasis markers rather than a full re-render, per
 * the Task 16 brief. Order matters: headings first (so a stray leading `#`
 * on a line doesn't survive), then bold, then underscores.
 */
export function stripMarkdownToText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s?/gm, "")
    .replace(/\*\*/g, "")
    .replace(/_/g, "");
}

/**
 * URL/filename-safe slug for a series title, used as the download's base
 * filename (`<slug>.md` / `<slug>.txt`). Falls back to "series" if the title
 * has no alphanumeric characters at all.
 */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "series";
}
