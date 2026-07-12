import { describe, expect, it } from "vitest";
import { renderSeriesMarkdown, slugifyTitle, stripMarkdownToText } from "../markdown";
import type { SeriesExportInput } from "../markdown";

const fullScope: SeriesExportInput["scope"] = {
  summaries: true,
  facts: true,
  entities: true,
  timeline: true,
  transcripts: true,
};

function fixture(overrides: Partial<SeriesExportInput> = {}): SeriesExportInput {
  return {
    series: {
      title: "Dad's Story",
      subjectName: "Henk de Vries",
      goal: "Capture stories for the grandkids",
    },
    summaries: [{ short: "First session: Henk's childhood in Rotterdam.", date: "Jan 3, 2026" }],
    factsByTopic: [
      {
        topic: "Meeting Jan",
        facts: [
          {
            statement: "Met Jan, spring 1975, on the Hoek van Holland ferry.",
            sessionLabel: "Session 3",
            timestamp: "04:12",
          },
        ],
      },
      {
        topic: "Childhood in Rotterdam",
        facts: [
          {
            statement: "Grew up above the bakery on Meentstraat, Rotterdam.",
            sessionLabel: "Session 1",
            timestamp: "01:38",
          },
        ],
      },
    ],
    people: [
      { name: "Jan", detail: "ferry friend" },
      { name: "Cor", detail: "uncle" },
    ],
    places: ["Rotterdam", "Hoek van Holland"],
    timeline: [{ label: "1975", statement: "Met Jan on the ferry." }],
    scope: fullScope,
    transcripts: [
      {
        sessionLabel: "Session 1",
        turns: [
          { role: "Anna", text: "Where did you grow up?" },
          { role: "Henk de Vries", text: "Above the bakery on Meentstraat." },
        ],
      },
    ],
    ...overrides,
  };
}

describe("renderSeriesMarkdown", () => {
  it("renders the title, summary, grouped facts with source lines, people, places, and timeline", () => {
    const md = renderSeriesMarkdown(fixture());

    expect(md).toContain("# Dad's Story");
    expect(md).toContain("First session: Henk's childhood in Rotterdam.");
    expect(md).toContain("## Meeting Jan");
    expect(md).toContain("Met Jan, spring 1975, on the Hoek van Holland ferry.");
    expect(md).toContain("— Session 3, 04:12");
    expect(md).toContain("## Childhood in Rotterdam");
    expect(md).toContain("— Session 1, 01:38");
    expect(md).toContain("## People");
    expect(md).toContain("Jan");
    expect(md).toContain("ferry friend");
    expect(md).toContain("## Places");
    expect(md).toContain("Rotterdam");
    expect(md).toContain("## Timeline");
    expect(md).toContain("1975");
    expect(md).toContain("Met Jan on the ferry.");
  });

  it("omits the summary section when scope.summaries is false", () => {
    const md = renderSeriesMarkdown(fixture({ scope: { ...fullScope, summaries: false } }));
    expect(md).not.toContain("## Summary");
    expect(md).not.toContain("First session: Henk's childhood in Rotterdam.");
  });

  it("omits fact/topic sections when scope.facts is false", () => {
    const md = renderSeriesMarkdown(fixture({ scope: { ...fullScope, facts: false } }));
    expect(md).not.toContain("## Meeting Jan");
    expect(md).not.toContain("Met Jan, spring 1975");
    expect(md).not.toContain("— Session 3, 04:12");
  });

  it("omits people and places when scope.entities is false", () => {
    const md = renderSeriesMarkdown(fixture({ scope: { ...fullScope, entities: false } }));
    expect(md).not.toContain("## People");
    expect(md).not.toContain("## Places");
    expect(md).not.toContain("ferry friend");
  });

  it("omits the timeline when scope.timeline is false", () => {
    const md = renderSeriesMarkdown(fixture({ scope: { ...fullScope, timeline: false } }));
    expect(md).not.toContain("## Timeline");
  });

  it("omits transcripts unless scope.transcripts is true and transcripts are provided", () => {
    const withoutScope = renderSeriesMarkdown(fixture({ scope: { ...fullScope, transcripts: false } }));
    expect(withoutScope).not.toContain("## Transcripts");
    expect(withoutScope).not.toContain("Where did you grow up?");

    const withoutData = renderSeriesMarkdown(fixture({ transcripts: undefined }));
    expect(withoutData).not.toContain("## Transcripts");
  });

  it("includes transcripts with role-labeled turns when scoped in", () => {
    const md = renderSeriesMarkdown(fixture());
    expect(md).toContain("## Transcripts");
    expect(md).toContain("### Session 1");
    expect(md).toContain("**Anna:** Where did you grow up?");
    expect(md).toContain("**Henk de Vries:** Above the bakery on Meentstraat.");
  });

  it("omits a topic group entirely if it has no facts", () => {
    const md = renderSeriesMarkdown(
      fixture({
        factsByTopic: [
          { topic: "Meeting Jan", facts: [] },
          {
            topic: "Childhood in Rotterdam",
            facts: [{ statement: "Grew up above the bakery.", sessionLabel: "Session 1", timestamp: null }],
          },
        ],
      }),
    );
    expect(md).not.toContain("## Meeting Jan");
    expect(md).toContain("## Childhood in Rotterdam");
  });

  it("omits the timestamp from the source line when a fact has no recorded offset", () => {
    const md = renderSeriesMarkdown(
      fixture({
        factsByTopic: [
          {
            topic: "Childhood in Rotterdam",
            facts: [{ statement: "Grew up above the bakery.", sessionLabel: "Manual entry", timestamp: null }],
          },
        ],
      }),
    );
    expect(md).toContain("— Manual entry");
    expect(md).not.toContain("— Manual entry,");
  });

  it("omits a person's detail suffix when none is given", () => {
    const md = renderSeriesMarkdown(fixture({ people: [{ name: "Willem" }] }));
    expect(md).toContain("Willem");
    expect(md).not.toMatch(/Willem\s*—/);
  });
});

describe("slugifyTitle", () => {
  it("lowercases and hyphenates the title", () => {
    expect(slugifyTitle("Dad's Story")).toBe("dads-story");
  });

  it("collapses punctuation and whitespace into single hyphens with no leading/trailing hyphen", () => {
    expect(slugifyTitle("  Henk's -- Life & Times!!  ")).toBe("henks-life-times");
  });

  it("falls back to a default slug for an empty/unusable title", () => {
    expect(slugifyTitle("   ")).toBe("series");
  });
});

describe("stripMarkdownToText", () => {
  it("strips heading markers, bold markers, and underscores", () => {
    const input = "# Dad's Story\n\n## Meeting Jan\n\n- **Jan** — ferry friend\n- _italic-ish_ note";
    const stripped = stripMarkdownToText(input);
    expect(stripped).not.toContain("#");
    expect(stripped).not.toContain("**");
    expect(stripped).not.toContain("_");
    expect(stripped).toContain("Dad's Story");
    expect(stripped).toContain("Meeting Jan");
    expect(stripped).toContain("Jan — ferry friend");
  });
});
