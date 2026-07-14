import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { ICONS } from "@/lib/pwa/icons";
import { APPLE_STARTUP_IMAGES } from "@/lib/pwa/splash";

/**
 * The icon and splash PNGs are generated once by
 * `scripts/generate-pwa-assets.mjs` and committed, while the URLs that point at
 * them live in the manifest and the startup-image list. Nothing links the two,
 * so a rename or a new iPhone size can silently produce a 404 that only shows
 * up as a blank launch screen on a real device. These tests are that link.
 */
describe("PWA assets", () => {
  it("ships every icon the manifest advertises", () => {
    for (const icon of manifest().icons ?? []) {
      expect(existsSync(`public${icon.src}`), `missing public${icon.src}`).toBe(true);
    }
  });

  it("ships the apple-touch-icon iOS reads instead of the manifest", () => {
    expect(existsSync("public/apple-touch-icon.png")).toBe(true);
  });

  it("ships every iOS splash screen, one per device", () => {
    expect(APPLE_STARTUP_IMAGES.length).toBeGreaterThan(0);
    for (const { url } of APPLE_STARTUP_IMAGES) {
      expect(existsSync(`public${url}`), `missing public${url}`).toBe(true);
    }
  });

  /**
   * Declaring `icons` in metadata switches OFF Next's file-convention pickup of
   * `app/icon.svg` — the file is still served, it just stops being linked in
   * the <head>. Nothing in a build surfaces that, so the tab icon quietly
   * reverts to the .ico. This is the guard.
   */
  it("explicitly links the SVG tab icon Next would otherwise drop", () => {
    const icon = (ICONS as { icon: { url: string }[] }).icon;
    expect(icon.map((i) => i.url)).toContain("/icon.svg");
    expect(existsSync("src/app/icon.svg")).toBe(true);
  });

  /** Next emits this one on its own — listing it too would duplicate the link. */
  it("ships favicon.ico without re-declaring it", () => {
    expect(existsSync("src/app/favicon.ico")).toBe(true);
    const icon = (ICONS as { icon: { url: string }[] }).icon;
    expect(icon.map((i) => i.url)).not.toContain("/favicon.ico");
  });

  it("is installable: standalone display, a start URL, and a 512px icon", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/app");
    expect(m.icons?.some((i) => i.sizes === "512x512")).toBe(true);
    // Android crops a non-maskable icon into a circle and clips the mark.
    expect(m.icons?.some((i) => i.purpose === "maskable")).toBe(true);
  });
});
