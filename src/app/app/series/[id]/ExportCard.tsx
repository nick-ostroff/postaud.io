"use client";

import { useState } from "react";
import { RadioCard } from "../new/formkit";

type ScopeKey = "summaries" | "facts" | "entities" | "timeline" | "transcripts";

// Mirrors mockup #1g's "What to include" checklist — same default-checked
// set as the export route's DEFAULT_SCOPE (everything but transcripts).
const SCOPE_OPTIONS: { key: ScopeKey; title: string; description: string; defaultOn: boolean }[] = [
  { key: "summaries", title: "Summary", description: "The short version of the story so far.", defaultOn: true },
  {
    key: "facts",
    title: "Memories by topic",
    description: "Every saved memory, grouped by topic, with its session and audio timestamp.",
    defaultOn: true,
  },
  {
    key: "entities",
    title: "People & places",
    description: "Everyone named and everywhere the stories happened.",
    defaultOn: true,
  },
  { key: "timeline", title: "Timeline", description: "Key moments, in order.", defaultOn: true },
  {
    key: "transcripts",
    title: "Full transcripts",
    description: "Every word of every session — makes a long file.",
    defaultOn: false,
  },
];

/**
 * Interactive slice of the series detail page's Export card (Task 16): pick
 * a format + what to include, then download via a plain `<a>` to the export
 * route — no fetch/JS-driven download, so it works exactly like clicking a
 * link to any other file. Kept as its own "use client" component so the rest
 * of the series page stays a server component.
 */
export function ExportCard({ seriesId }: { seriesId: string }) {
  const [format, setFormat] = useState<"md" | "txt">("md");
  const [scope, setScope] = useState<Record<ScopeKey, boolean>>(() =>
    Object.fromEntries(SCOPE_OPTIONS.map((o) => [o.key, o.defaultOn])) as Record<ScopeKey, boolean>,
  );

  const activeScope = SCOPE_OPTIONS.filter((o) => scope[o.key]).map((o) => o.key);
  const href = `/api/series/${seriesId}/export?format=${format}&scope=${activeScope.join(",")}`;

  return (
    <>
      <div className="mt-3 grid gap-2">
        <RadioCard
          title="Markdown (.md)"
          description="Headings, bullets and source lines — reads well anywhere, forever."
          selected={format === "md"}
          onClick={() => setFormat("md")}
        />
        <RadioCard
          title="Plain text (.txt)"
          description="Just the words, no formatting."
          selected={format === "txt"}
          onClick={() => setFormat("txt")}
        />
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        {SCOPE_OPTIONS.map((o) => (
          <label key={o.key} className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={scope[o.key]}
              onChange={() => setScope((s) => ({ ...s, [o.key]: !s[o.key] }))}
              className="mt-1 h-3.5 w-3.5 accent-green"
            />
            <span>
              <span className="block text-[13px] font-medium text-ink">{o.title}</span>
              <span className="block text-[12px] leading-snug text-faint">{o.description}</span>
            </span>
          </label>
        ))}
      </div>

      <a
        href={href}
        className="mt-3.5 inline-flex items-center gap-2 rounded-pill border border-green bg-green px-[18px] py-[9px] text-[13.5px] font-semibold text-white transition-colors hover:border-green-deep hover:bg-green-deep"
      >
        ↧ Download .{format}
      </a>
      <div className="mt-1.5 text-xs text-faint">Audio never leaves postaud.io unless you export it explicitly.</div>
    </>
  );
}
