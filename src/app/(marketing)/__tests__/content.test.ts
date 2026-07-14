import { describe, it, expect } from "vitest";
import { FAQS, faqJsonLd, softwareJsonLd } from "../content";

describe("landing content", () => {
  it("ships a real FAQ", () => {
    expect(FAQS.length).toBeGreaterThanOrEqual(5);
    for (const f of FAQS) {
      expect(f.q.trim().length).toBeGreaterThan(0);
      expect(f.a.trim().length).toBeGreaterThan(0);
    }
  });

  it("generates FAQPage JSON-LD from the same array the page renders", () => {
    const ld = faqJsonLd() as {
      "@type": string;
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };

    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(FAQS.length);

    // Every rendered question/answer must appear verbatim in the structured
    // data. If someone edits the copy and hand-edits the JSON-LD, this fails.
    FAQS.forEach((f, i) => {
      expect(ld.mainEntity[i].name).toBe(f.q);
      expect(ld.mainEntity[i].acceptedAnswer.text).toBe(f.a);
    });
  });

  it("describes the product in SoftwareApplication JSON-LD", () => {
    const ld = softwareJsonLd() as { "@type": string; name: string };
    expect(ld["@type"]).toBe("SoftwareApplication");
    expect(ld.name).toBe("PostAud.io");
  });
});
