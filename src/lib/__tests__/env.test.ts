import { describe, it, expect } from "vitest";
describe("env", () => {
  it("no longer requires Twilio configuration", async () => {
    const src = await import("node:fs").then(fs =>
      fs.readFileSync("src/lib/env.ts", "utf8"));
    expect(src).not.toMatch(/TWILIO/);
    expect(src).not.toMatch(/STRIPE/);
    expect(src).toMatch(/OPENAI_API_KEY/);
    expect(src).toMatch(/CRON_SECRET/);
  });
});
