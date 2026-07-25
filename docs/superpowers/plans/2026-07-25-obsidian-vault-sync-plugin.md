# Obsidian Vault Sync — Plugin Implementation Plan (Phase 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PostAud.io Obsidian community plugin — paste a token, link a series to a vault folder, and receive user-initiated pushes as Markdown notes (single-note or linked-graph layout), rewriting only what changed and never touching a file the plugin doesn't own.

**Architecture:** A thin Obsidian shell (`main.ts`, settings tab) around a pure, fully-tested core: a typed API client, Markdown renderers, a hash-driven diff planner, and a sync engine that operates through a tiny `VaultFs` interface. The real Obsidian vault adapter implements `VaultFs` in ~40 lines; everything else runs under Vitest with an in-memory fake. Change detection reuses the **server's** content hashes (`contentHash`, per-topic, per-entity) — the plugin computes no hashes of its own, which keeps the core free of crypto and mobile-safe.

**Tech Stack:** TypeScript (strict), esbuild (bundle to `main.js`), Vitest, `obsidian` typings package. No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-07-18-obsidian-vault-sync-design.md` (in the postaud-io repo)

## Global Constraints

- **Two repos.** Task 1 modifies the existing server repo `/Users/nickostroff/claude-global/claude-projects/99-apps/postaud-io`. Tasks 2+ build the new plugin repo at `/Users/nickostroff/claude-global/claude-projects/99-apps/postaud-obsidian` (git-init'd in Task 2). Every path below is relative to whichever repo the task names.
- **The server repo is NOT the Next.js you know** — for Task 1 only, read `node_modules/next/dist/docs/` guidance if touching route code (Task 1 touches a pure builder + test, no route changes needed).
- **Mobile-safe plugin core:** nothing under the plugin's `src/` may import `node:*` builtins, `fs`, `path`, or `crypto`. The `obsidian` module may be imported ONLY by `src/main.ts`, `src/settings.ts`, and `src/sync/obsidian-fs.ts` — the pure core (api, render, plan, state, engine, slug, vault-fs, memory-fs) must run under plain Vitest with no Obsidian present.
- **Ownership contract (vault safety):** every file the plugin writes carries `source: postaud.io` in YAML frontmatter. The plugin must never modify, rename, or delete an existing file whose content lacks that marker. This check lives in ONE place (`applyPlan` in `src/sync/engine.ts`) and no code path may bypass it.
- **Server hashes are the only change detector.** Stored note hashes are `v<TEMPLATE_VERSION>:<serverHash>`. Changing any renderer template requires bumping `TEMPLATE_VERSION` in `src/sync/render.ts` (forces a one-time full rewrite).
- **Ack echoes `requestedAt` verbatim** (the value from `/api/vault/pending`) — never a locally-generated timestamp. Ack ONLY after a successful apply (or after a confirmed no-op); a failed apply must leave the flag pending.
- **API surface (already live on the server, `Authorization: Bearer pat_…`):**
  - `GET /api/series?format=json` → `{ series: [{ id, title, subjectName, status }] }`
  - `GET /api/series/[id]/export?format=json` → `SeriesExportJsonPayload` (see Task 3 types)
  - `POST /api/series/[id]/vault-link` body `{ label }` → `{ ok: true }` (400 `label_required`, 404 `not_found`)
  - `DELETE /api/series/[id]/vault-link` → `{ ok: true }`
  - `GET /api/vault/pending` → `{ pending: [{ seriesId, title, requestedAt }] }`
  - `POST /api/series/[id]/vault-ack` body `{ requestedAt }` → `{ ok: true }` (400 `requested_at_required` / `requested_at_in_future`)
  - Every endpoint returns 401 `{ error: "unauthorized" }` for a bad/revoked token.
- Default server base URL: `https://postaud.io` (user-editable setting; localhost override for dev).
- Plugin identity: manifest id `postaud-io`, name `PostAud.io Vault Sync`, version `0.1.0`, `minAppVersion: "1.5.0"`, `isDesktopOnly: false`.
- Tests live in `src/**/__tests__/*.test.ts` and run with `npx vitest run` (same convention as the server repo).
- Commit after every task. Plugin repo commits do not need the server repo's migration rules.

---

## File Structure

**Task 1 modifies (server repo):**
- `src/server/export/series-data.ts` — add `id` to topic groups + JSON topics
- `src/server/export/__tests__/series-data.test.ts` — coverage for the new field

**Tasks 2+ create (plugin repo `postaud-obsidian/`):**

```
manifest.json            plugin identity (id postaud-io)
versions.json            { "0.1.0": "1.5.0" }
package.json             scripts: build / dev / test / check
tsconfig.json            strict, bundler resolution
esbuild.config.mjs       src/main.ts → main.js (cjs, external: obsidian)
vitest.config.ts         collects src/**/__tests__/*.test.ts
src/
  api/types.ts           mirrors the server's JSON payload shapes
  api/client.ts          PostAudClient over an injectable HttpFn
  sync/slug.ts           filename sanitization + series slug
  sync/render.ts         TEMPLATE_VERSION + all Markdown renderers
  sync/state.ts          SyncState types + (de)serialization
  sync/plan.ts           planSeriesSync: payload+state+link → ops+next state
  sync/vault-fs.ts       VaultFs interface + isOwnedContent guard predicate
  sync/memory-fs.ts      InMemoryVaultFs (test fake, also exported)
  sync/engine.ts         applyPlan (ownership guard) + sync orchestration
  sync/obsidian-fs.ts    real VaultFs over app.vault.adapter   [obsidian import OK]
  settings.ts            PluginSettings + settings tab + link modal [obsidian import OK]
  main.ts                Plugin class: triggers, commands, data persistence [obsidian import OK]
  __tests__/…            colocated per-module tests
README.md                install (BRAT + manual), connect walkthrough
```

**Why this shape:** the Obsidian API is untestable outside the app, so everything that can be wrong lives behind two seams — `HttpFn` (network) and `VaultFs` (disk) — and is exercised by real tests. The three obsidian-importing files stay too thin to hide bugs.

---

## Task 1: Server — topic ids in the JSON export

The JSON payload's topics currently carry only `name`; without a stable id the plugin cannot tell "topic renamed" from "topic deleted + new topic created", violating the spec's rename rule ("renames its own note … never creates a duplicate"). `buildSeriesExportData` already holds the ids. Additive only: the Markdown renderer ignores the new field; per-topic `hash` (over facts) is unchanged; top-level `contentHash` shifts once, which is harmless pre-plugin.

**Repo:** `/Users/nickostroff/claude-global/claude-projects/99-apps/postaud-io`

**Files:**
- Modify: `src/server/export/series-data.ts`
- Test: `src/server/export/__tests__/series-data.test.ts`

**Interfaces:**
- Produces: `SeriesExportTopicGroupWithEntities.id: string | null` and `SeriesExportJsonTopic.id: string | null` (`null` = the synthetic "Other" bucket). The plugin (Task 3) keys topic notes by `topic:<id ?? "other">`.

- [ ] **Step 1: Write the failing test** — add to `src/server/export/__tests__/series-data.test.ts` (reuse the file's existing `TOPICS`/`FACTS`/`ENTITIES` fixtures and mock wiring; follow the shape of the existing `buildJsonPayload` tests there):

```ts
it("carries each topic's id through factsByTopic and the JSON payload", async () => {
  mocks.getSeriesKnowledge.mockResolvedValue({ topics: TOPICS, facts: FACTS, entities: ENTITIES });
  const data = await buildSeriesExportData(fakeSupabase, "series-1", FULL_SCOPE);
  const payload = buildJsonPayload("series-1", data!);
  for (const group of data!.factsByTopic.filter((g) => g.topic !== "Other")) {
    expect(TOPICS.map((t) => t.id)).toContain(group.id);
  }
  const other = payload.topics.find((t) => t.name === "Other");
  if (other) expect(other.id).toBeNull();
  for (const t of payload.topics.filter((t) => t.name !== "Other")) {
    expect(t.id).toEqual(TOPICS.find((x) => x.name === t.name)?.id);
  }
});
```

(If the test file has no `FULL_SCOPE` constant, use the scope literal the neighboring tests pass to `buildSeriesExportData`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/server/export/__tests__/series-data.test.ts`
Expected: FAIL — `group.id` is `undefined`.

- [ ] **Step 3: Implement** — in `src/server/export/series-data.ts`:
  1. `export type SeriesExportTopicGroupWithEntities = { id: string | null; topic: string; facts: SeriesExportFactWithEntities[] };`
  2. In `buildSeriesExportData`: `const otherGroup … = { id: null, topic: "Other", facts: [] };` and when seeding `groupsById.set(fact.topic_id, { id: fact.topic_id, topic: …, facts: [] })`.
  3. `export type SeriesExportJsonTopic = { id: string | null; name: string; hash: string; facts: SeriesExportJsonFact[] };` and in `buildJsonPayload`: `return { id: group.id, name: group.topic, hash: stableHash(facts), facts };` — the hash input stays `facts` only, so per-topic hashes are unchanged.

- [ ] **Step 4: Run the full export test files**

Run: `npx vitest run src/server/export/__tests__/ "src/app/api/series/[id]/__tests__/route.test.ts"`
Expected: ALL PASS (existing contentHash-stability tests compare payload-to-payload, not to a frozen literal — if any test pinned an exact `contentHash` string, update that literal and note it in the commit message).

- [ ] **Step 5: Typecheck + full suite + commit**

```bash
npx tsc --noEmit && npx vitest run
git add src/server/export/ && git commit -m "feat(export): topic ids in the JSON payload — the plugin needs stable identity for rename handling"
git push
```

---

## Task 2: Plugin repo scaffold + build toolchain

**Repo (all tasks from here):** `/Users/nickostroff/claude-global/claude-projects/99-apps/postaud-obsidian` — create it.

**Files:** Create `manifest.json`, `versions.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `vitest.config.ts`, `.gitignore`, `src/main.ts` (placeholder).

- [ ] **Step 1: Scaffold**

```bash
mkdir -p /Users/nickostroff/claude-global/claude-projects/99-apps/postaud-obsidian/src
cd /Users/nickostroff/claude-global/claude-projects/99-apps/postaud-obsidian && git init
```

`manifest.json`:
```json
{
  "id": "postaud-io",
  "name": "PostAud.io Vault Sync",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "Mirror your PostAud.io interview knowledge into your vault — user-initiated pushes, single-note or linked-graph layout, never touches your own notes.",
  "author": "PostAud.io",
  "authorUrl": "https://postaud.io",
  "isDesktopOnly": false
}
```

`versions.json`:
```json
{ "0.1.0": "1.5.0" }
```

`package.json`:
```json
{
  "name": "postaud-obsidian",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node esbuild.config.mjs watch",
    "build": "tsc --noEmit && node esbuild.config.mjs",
    "test": "vitest run",
    "check": "tsc --noEmit && vitest run"
  },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "obsidian": "latest",
    "typescript": "^5.6.0",
    "vitest": "^4.0.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*.ts", "esbuild.config.mjs", "vitest.config.ts"]
}
```

`esbuild.config.mjs`:
```js
import esbuild from "esbuild";
import process from "node:process";

const watch = process.argv[2] === "watch";
const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "es2022",
  outfile: "main.js",
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
});
if (watch) await ctx.watch();
else { await ctx.rebuild(); await ctx.dispose(); }
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/__tests__/*.test.ts"] } });
```

`.gitignore`:
```
node_modules/
main.js
*.map
```

`src/main.ts` (placeholder — replaced in Task 11):
```ts
import { Plugin } from "obsidian";

export default class PostAudPlugin extends Plugin {
  async onload() {
    console.log("postaud-io: loaded");
  }
}
```

- [ ] **Step 2: Install and verify the toolchain**

Run: `npm install && npm run build && npm test`
Expected: build emits `main.js`; vitest reports "no test files found" exit 0 (if vitest exits 1 on empty, add `passWithNoTests: true` to the vitest config test block).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: scaffold PostAud.io Obsidian plugin — esbuild + vitest toolchain"
```

---

## Task 3: API types + client

**Files:**
- Create: `src/api/types.ts`, `src/api/client.ts`
- Test: `src/api/__tests__/client.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces (used by Tasks 5, 7, 9, 10):
  - `ExportPayload`, `ExportTopic`, `ExportEntity`, `ExportFact`, `FactEntityRef`, `PendingItem`, `SeriesListItem` (types.ts)
  - `class PostAudClient { constructor(http: HttpFn, baseUrl: string, token: string) }` with `listSeries(): Promise<SeriesListItem[]>`, `listPending(): Promise<PendingItem[]>`, `fetchExport(seriesId: string): Promise<ExportPayload>`, `linkSeries(seriesId: string, label: string): Promise<void>`, `unlinkSeries(seriesId: string): Promise<void>`, `ack(seriesId: string, requestedAt: string): Promise<void>`
  - `class PostAudApiError extends Error { status: number }`
  - `type HttpFn = (req: { url: string; method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; json: unknown }>`

- [ ] **Step 1: Write `src/api/types.ts`** (mirrors the server's `SeriesExportJsonPayload` from `src/server/export/series-data.ts`, including Task 1's topic `id`):

```ts
/** Shapes returned by the PostAud.io API — mirror of the server's
 * SeriesExportJsonPayload (src/server/export/series-data.ts in postaud-io).
 * `hash` values are opaque server-computed change detectors. */
export type SeriesListItem = { id: string; title: string; subjectName: string; status: string };
export type PendingItem = { seriesId: string; title: string; requestedAt: string };
export type FactEntityRef = { id: string; name: string; kind: string };
export type ExportFact = {
  statement: string;
  sessionLabel: string;
  timestamp: string | null;
  entities: FactEntityRef[];
};
export type ExportTopic = { id: string | null; name: string; hash: string; facts: ExportFact[] };
export type ExportEntity = {
  id: string;
  name: string;
  kind: "person" | "place" | "date";
  detail: string | null;
  hash: string;
};
export type ExportPayload = {
  series: { id: string; title: string; subjectName: string; goal: string };
  contentHash: string;
  topics: ExportTopic[];
  entities: ExportEntity[];
  summaries: Array<{ short: string; date: string }>;
  timeline: Array<{ label: string; statement: string }>;
};
```

- [ ] **Step 2: Write the failing test** — `src/api/__tests__/client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { PostAudApiError, PostAudClient } from "../client";

function fakeHttp(status: number, json: unknown) {
  return vi.fn(async () => ({ status, json }));
}

describe("PostAudClient", () => {
  it("sends the bearer token and hits the right endpoints", async () => {
    const http = fakeHttp(200, { pending: [{ seriesId: "s1", title: "T", requestedAt: "2026-07-25T00:00:00Z" }] });
    const client = new PostAudClient(http, "https://postaud.io", "pat_abc");
    const pending = await client.listPending();
    expect(pending).toEqual([{ seriesId: "s1", title: "T", requestedAt: "2026-07-25T00:00:00Z" }]);
    expect(http).toHaveBeenCalledWith({
      url: "https://postaud.io/api/vault/pending",
      method: "GET",
      headers: { Authorization: "Bearer pat_abc", "Content-Type": "application/json" },
    });
  });

  it("strips a trailing slash from the base URL", async () => {
    const http = fakeHttp(200, { series: [] });
    await new PostAudClient(http, "https://postaud.io/", "pat_abc").listSeries();
    expect(http.mock.calls[0][0].url).toBe("https://postaud.io/api/series?format=json");
  });

  it("throws PostAudApiError with the status on non-2xx", async () => {
    const client = new PostAudClient(fakeHttp(401, { error: "unauthorized" }), "https://postaud.io", "pat_bad");
    await expect(client.listSeries()).rejects.toMatchObject({ status: 401 });
    await expect(client.listSeries()).rejects.toBeInstanceOf(PostAudApiError);
  });

  it("POSTs vault-link with the label and acks with requestedAt", async () => {
    const http = fakeHttp(200, { ok: true });
    const client = new PostAudClient(http, "https://postaud.io", "pat_abc");
    await client.linkSeries("s1", "MyVault / PostAud");
    expect(http).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "https://postaud.io/api/series/s1/vault-link",
        method: "POST",
        body: JSON.stringify({ label: "MyVault / PostAud" }),
      }),
    );
    await client.ack("s1", "2026-07-25T00:00:00Z");
    expect(http).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "https://postaud.io/api/series/s1/vault-ack",
        body: JSON.stringify({ requestedAt: "2026-07-25T00:00:00Z" }),
      }),
    );
  });

  it("fetches the JSON export for a series", async () => {
    const payload = { series: { id: "s1", title: "T", subjectName: "S", goal: "G" }, contentHash: "h", topics: [], entities: [], summaries: [], timeline: [] };
    const http = fakeHttp(200, payload);
    const client = new PostAudClient(http, "https://postaud.io", "pat_abc");
    expect(await client.fetchExport("s1")).toEqual(payload);
    expect(http.mock.calls[0][0].url).toBe("https://postaud.io/api/series/s1/export?format=json");
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `npx vitest run src/api/__tests__/client.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement `src/api/client.ts`:**

```ts
import type { ExportPayload, PendingItem, SeriesListItem } from "./types";

export type HttpFn = (req: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}) => Promise<{ status: number; json: unknown }>;

export class PostAudApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "PostAudApiError";
  }
}

/** Typed wrapper over the six PostAud.io vault-sync endpoints. Transport is
 * injected (Obsidian's requestUrl in the app, a mock in tests). */
export class PostAudClient {
  private base: string;
  constructor(private http: HttpFn, baseUrl: string, private token: string) {
    this.base = baseUrl.replace(/\/+$/, "");
  }

  private async call(path: string, method: string, body?: unknown): Promise<unknown> {
    const res = await this.http({
      url: `${this.base}${path}`,
      method,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (res.status < 200 || res.status >= 300) {
      throw new PostAudApiError(res.status, `PostAud.io API ${method} ${path} → ${res.status}`);
    }
    return res.json;
  }

  async listSeries(): Promise<SeriesListItem[]> {
    const json = (await this.call("/api/series?format=json", "GET")) as { series?: SeriesListItem[] };
    return json.series ?? [];
  }

  async listPending(): Promise<PendingItem[]> {
    const json = (await this.call("/api/vault/pending", "GET")) as { pending?: PendingItem[] };
    return json.pending ?? [];
  }

  async fetchExport(seriesId: string): Promise<ExportPayload> {
    return (await this.call(`/api/series/${seriesId}/export?format=json`, "GET")) as ExportPayload;
  }

  async linkSeries(seriesId: string, label: string): Promise<void> {
    await this.call(`/api/series/${seriesId}/vault-link`, "POST", { label });
  }

  async unlinkSeries(seriesId: string): Promise<void> {
    await this.call(`/api/series/${seriesId}/vault-link`, "DELETE");
  }

  async ack(seriesId: string, requestedAt: string): Promise<void> {
    await this.call(`/api/series/${seriesId}/vault-ack`, "POST", { requestedAt });
  }
}
```

- [ ] **Step 5: Run tests** — `npx vitest run src/api/__tests__/client.test.ts` → PASS.

- [ ] **Step 6: Commit** — `git add src/api && git commit -m "feat(api): typed PostAud.io client over an injectable transport"`

---

## Task 4: Filename helpers

**Files:**
- Create: `src/sync/slug.ts`
- Test: `src/sync/__tests__/slug.test.ts`

**Interfaces:**
- Produces (used by Tasks 5, 7): `safeFileName(name: string): string` (display-cased, filesystem/Obsidian-safe basename, no extension) and `slugifyTitle(title: string): string` (lowercase-dash slug for the single-note filename).

- [ ] **Step 1: Write the failing test** — `src/sync/__tests__/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeFileName, slugifyTitle } from "../slug";

describe("safeFileName", () => {
  it("strips characters Obsidian or filesystems forbid", () => {
    expect(safeFileName('Rosa: the "boss" <of> C:\\home | #1?')).toBe("Rosa the boss of Chome 1");
  });
  it("collapses whitespace and trims leading/trailing dots and spaces", () => {
    expect(safeFileName("  ..A   B..  ")).toBe("A B");
  });
  it("strips wikilink-breaking brackets and carets", () => {
    expect(safeFileName("A [[B]] ^C")).toBe("A B C");
  });
  it("falls back to Untitled for an empty result", () => {
    expect(safeFileName("###")).toBe("Untitled");
  });
});

describe("slugifyTitle", () => {
  it("lowercases, dashes, and strips punctuation", () => {
    expect(slugifyTitle("Dad's Life — Story!")).toBe("dads-life-story");
  });
  it("falls back to series for an empty result", () => {
    expect(slugifyTitle("???")).toBe("series");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/sync/__tests__/slug.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/sync/slug.ts`:**

```ts
/** Vault-safe display filename: keeps case and spaces, removes everything
 * Obsidian wikilinks or common filesystems choke on. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return cleaned || "Untitled";
}

/** Lowercase-dash slug for the single-note filename (mirrors the server's
 * export filename style). */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "series";
}
```

- [ ] **Step 4: Run tests** → PASS. Adjust the first test's expectation only if your regex order produces a different-but-still-safe string — the invariant is "no `\/:*?"<>|#^[]` characters survive", not the exact letters.

- [ ] **Step 5: Commit** — `git add src/sync && git commit -m "feat(sync): vault-safe filename helpers"`

---

## Task 5: Markdown renderers

**Files:**
- Create: `src/sync/render.ts`
- Test: `src/sync/__tests__/render.test.ts`

**Interfaces:**
- Consumes: `ExportPayload`, `ExportTopic`, `ExportEntity` (Task 3).
- Produces (used by Task 7):
  - `TEMPLATE_VERSION: number` (starts at 1 — bump on ANY template change)
  - `renderSingleNote(payload: ExportPayload, syncedAt: string): string`
  - `renderIndexNote(payload: ExportPayload, topicLinks: Array<{ name: string; path: string }>, entityPathById: Map<string, string>, syncedAt: string): string`
  - `renderTopicNote(topic: ExportTopic, payload: ExportPayload, entityPathById: Map<string, string>, syncedAt: string): string`
  - `renderEntityNote(entity: ExportEntity, payload: ExportPayload, syncedAt: string): string`
  - `wikilink(path: string, display: string): string` — `[[path-sans-.md|display]]`
- All notes start with YAML frontmatter whose first key is `source: postaud.io` plus `series_id`. Values that could contain YAML-hostile characters (titles, names) are JSON-quoted.

- [ ] **Step 1: Write the failing test** — `src/sync/__tests__/render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ExportPayload } from "../../api/types";
import { renderEntityNote, renderIndexNote, renderSingleNote, renderTopicNote, wikilink } from "../render";

const PAYLOAD: ExportPayload = {
  series: { id: "s1", title: "Dad's Life", subjectName: "Peter", goal: "Capture it all" },
  contentHash: "abc123",
  topics: [
    {
      id: "t1",
      name: "Childhood",
      hash: "th1",
      facts: [
        {
          statement: "Grew up in Detroit with Rosa.",
          sessionLabel: "Session 1",
          timestamp: "3:45",
          entities: [
            { id: "e1", name: "Rosa", kind: "person" },
            { id: "e2", name: "Detroit", kind: "place" },
            { id: "e9", name: "Acme Co", kind: "org" },
          ],
        },
        { statement: "No links here.", sessionLabel: "Session 2", timestamp: null, entities: [] },
      ],
    },
  ],
  entities: [
    { id: "e1", name: "Rosa", kind: "person", detail: "His mother", hash: "eh1" },
    { id: "e2", name: "Detroit", kind: "place", detail: null, hash: "eh2" },
  ],
  summaries: [{ short: "Talked childhood.", date: "Jul 12, 2026" }],
  timeline: [{ label: "1961", statement: "Born." }],
};

const ENTITY_PATHS = new Map([
  ["e1", "PostAud/Dad's Life/entities/Rosa.md"],
  ["e2", "PostAud/Dad's Life/entities/Detroit.md"],
]);

describe("wikilink", () => {
  it("links the path without .md and with a display alias", () => {
    expect(wikilink("a/b/Rosa.md", "Rosa")).toBe("[[a/b/Rosa|Rosa]]");
  });
});

describe("renderSingleNote", () => {
  const md = renderSingleNote(PAYLOAD, "2026-07-25T10:00:00Z");
  it("carries the ownership frontmatter", () => {
    expect(md.startsWith("---\nsource: postaud.io\nseries_id: s1\n")).toBe(true);
    expect(md).toContain("synced_at: 2026-07-25T10:00:00Z");
  });
  it("renders every section with plain entity names (no wikilinks)", () => {
    expect(md).toContain("# Dad's Life");
    expect(md).toContain("## Session summaries");
    expect(md).toContain("**Jul 12, 2026** — Talked childhood.");
    expect(md).toContain("## Childhood");
    expect(md).toContain("- Grew up in Detroit with Rosa. *(Session 1, 3:45)*");
    expect(md).toContain("- No links here. *(Session 2)*");
    expect(md).not.toContain("[[");
    expect(md).toContain("## People");
    expect(md).toContain("**Rosa** — His mother");
    expect(md).toContain("## Places");
    expect(md).toContain("## Timeline");
    expect(md).toContain("**1961** — Born.");
  });
});

describe("renderTopicNote", () => {
  const md = renderTopicNote(PAYLOAD.topics[0], PAYLOAD, ENTITY_PATHS, "2026-07-25T10:00:00Z");
  it("wikilinks entities that have notes and leaves others plain", () => {
    expect(md).toContain("[[PostAud/Dad's Life/entities/Rosa|Rosa]]");
    expect(md).toContain("[[PostAud/Dad's Life/entities/Detroit|Detroit]]");
    expect(md).toContain("Acme Co");
    expect(md).not.toContain("[[Acme Co");
  });
  it("marks identity in frontmatter", () => {
    expect(md).toContain("note: topic");
    expect(md).toContain("topic_id: t1");
  });
});

describe("renderEntityNote", () => {
  const md = renderEntityNote(PAYLOAD.entities[0], PAYLOAD, "2026-07-25T10:00:00Z");
  it("tags the kind and renders the detail", () => {
    expect(md).toContain("#person");
    expect(md).toContain("# Rosa");
    expect(md).toContain("His mother");
    expect(md).toContain("entity_id: e1");
  });
});

describe("renderIndexNote", () => {
  const md = renderIndexNote(
    PAYLOAD,
    [{ name: "Childhood", path: "PostAud/Dad's Life/topics/Childhood.md" }],
    ENTITY_PATHS,
    "2026-07-25T10:00:00Z",
  );
  it("links topics and entities and lists sessions", () => {
    expect(md).toContain("[[PostAud/Dad's Life/topics/Childhood|Childhood]]");
    expect(md).toContain("[[PostAud/Dad's Life/entities/Rosa|Rosa]] — His mother");
    expect(md).toContain("**Jul 12, 2026** — Talked childhood.");
    expect(md).toContain("note: index");
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `src/sync/render.ts`:**

```ts
import type { ExportEntity, ExportFact, ExportPayload, ExportTopic } from "../api/types";

/** Bump on ANY change to the templates below — stored note hashes embed this,
 * so a bump forces a one-time rewrite of every owned note. */
export const TEMPLATE_VERSION = 1;

export function wikilink(path: string, display: string): string {
  return `[[${path.replace(/\.md$/, "")}|${display}]]`;
}

/** YAML frontmatter. `source: postaud.io` is ALWAYS first — the ownership
 * marker the guard in engine.ts looks for. String values that could contain
 * YAML-hostile characters are JSON-quoted. */
function frontmatter(fields: Array<[string, string]>): string {
  const lines = fields.map(([k, v]) =>
    /^[A-Za-z0-9 _.:\-]*$/.test(v) ? `${k}: ${v}` : `${k}: ${JSON.stringify(v)}`,
  );
  return `---\n${lines.join("\n")}\n---\n`;
}

function factLine(fact: ExportFact, entityPathById: Map<string, string> | null): string {
  const source = fact.timestamp ? `*(${fact.sessionLabel}, ${fact.timestamp})*` : `*(${fact.sessionLabel})*`;
  const links =
    entityPathById === null
      ? []
      : fact.entities.map((e) => {
          const path = entityPathById.get(e.id);
          return path ? wikilink(path, e.name) : e.name;
        });
  const suffix = links.length > 0 ? ` — ${links.join(", ")}` : "";
  return `- ${fact.statement} ${source}${suffix}`;
}

function summariesSection(payload: ExportPayload): string[] {
  if (payload.summaries.length === 0) return [];
  return ["## Session summaries", "", ...payload.summaries.map((s) => `- **${s.date}** — ${s.short}`), ""];
}

function timelineSection(payload: ExportPayload): string[] {
  if (payload.timeline.length === 0) return [];
  return ["## Timeline", "", ...payload.timeline.map((t) => `- **${t.label}** — ${t.statement}`), ""];
}

export function renderSingleNote(payload: ExportPayload, syncedAt: string): string {
  const head = frontmatter([
    ["source", "postaud.io"],
    ["series_id", payload.series.id],
    ["note", "single"],
    ["title", payload.series.title],
    ["subject", payload.series.subjectName],
    ["synced_at", syncedAt],
  ]);
  const people = payload.entities.filter((e) => e.kind === "person");
  const places = payload.entities.filter((e) => e.kind === "place");
  const body: string[] = [
    `# ${payload.series.title}`,
    "",
    `**Subject:** ${payload.series.subjectName}`,
    `**Goal:** ${payload.series.goal}`,
    "",
    ...summariesSection(payload),
    ...payload.topics.flatMap((t) => [`## ${t.name}`, "", ...t.facts.map((f) => factLine(f, null)), ""]),
    ...(people.length > 0
      ? ["## People", "", ...people.map((p) => `- **${p.name}**${p.detail ? ` — ${p.detail}` : ""}`), ""]
      : []),
    ...(places.length > 0 ? ["## Places", "", ...places.map((p) => `- ${p.name}`), ""] : []),
    ...timelineSection(payload),
  ];
  return head + "\n" + body.join("\n");
}

export function renderTopicNote(
  topic: ExportTopic,
  payload: ExportPayload,
  entityPathById: Map<string, string>,
  syncedAt: string,
): string {
  const head = frontmatter([
    ["source", "postaud.io"],
    ["series_id", payload.series.id],
    ["note", "topic"],
    ["topic_id", topic.id ?? "other"],
    ["title", topic.name],
    ["synced_at", syncedAt],
  ]);
  const body = [`# ${topic.name}`, "", ...topic.facts.map((f) => factLine(f, entityPathById)), ""];
  return head + "\n" + body.join("\n");
}

export function renderEntityNote(entity: ExportEntity, payload: ExportPayload, syncedAt: string): string {
  const head = frontmatter([
    ["source", "postaud.io"],
    ["series_id", payload.series.id],
    ["note", "entity"],
    ["entity_id", entity.id],
    ["kind", entity.kind],
    ["title", entity.name],
    ["synced_at", syncedAt],
  ]);
  const body = [`# ${entity.name}`, "", `#${entity.kind}`, "", ...(entity.detail ? [entity.detail, ""] : [])];
  return head + "\n" + body.join("\n");
}

export function renderIndexNote(
  payload: ExportPayload,
  topicLinks: Array<{ name: string; path: string }>,
  entityPathById: Map<string, string>,
  syncedAt: string,
): string {
  const head = frontmatter([
    ["source", "postaud.io"],
    ["series_id", payload.series.id],
    ["note", "index"],
    ["title", payload.series.title],
    ["synced_at", syncedAt],
  ]);
  const entityLine = (e: ExportEntity): string => {
    const path = entityPathById.get(e.id);
    const name = path ? wikilink(path, e.name) : `**${e.name}**`;
    return `- ${name}${e.detail ? ` — ${e.detail}` : ""}`;
  };
  const people = payload.entities.filter((e) => e.kind === "person");
  const places = payload.entities.filter((e) => e.kind === "place");
  const body: string[] = [
    `# ${payload.series.title}`,
    "",
    `**Subject:** ${payload.series.subjectName}`,
    `**Goal:** ${payload.series.goal}`,
    "",
    ...(payload.summaries.length > 0
      ? ["## Sessions", "", ...payload.summaries.map((s) => `- **${s.date}** — ${s.short}`), ""]
      : []),
    ...(topicLinks.length > 0
      ? ["## Topics", "", ...topicLinks.map((t) => `- ${wikilink(t.path, t.name)}`), ""]
      : []),
    ...(people.length > 0 ? ["## People", "", ...people.map(entityLine), ""] : []),
    ...(places.length > 0 ? ["## Places", "", ...places.map(entityLine), ""] : []),
    ...timelineSection(payload),
  ];
  return head + "\n" + body.join("\n");
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/sync/__tests__/render.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/sync && git commit -m "feat(render): single-note and linked-graph Markdown templates with ownership frontmatter"`

---

## Task 6: Sync state

**Files:**
- Create: `src/sync/state.ts`
- Test: `src/sync/__tests__/state.test.ts`

**Interfaces:**
- Produces (used by Tasks 7, 9, 11):
  - `type NoteState = { path: string; hash: string }`
  - `type SeriesSyncState = { lastContentHash: string | null; notes: Record<string, NoteState> }` — note keys: `"single"`, `"index"`, `` `topic:${topicId ?? "other"}` ``, `` `entity:${entityId}` ``
  - `type SyncState = Record<string, SeriesSyncState>` (keyed by seriesId)
  - `emptySeriesState(): SeriesSyncState`
  - `parseSyncState(raw: unknown): SyncState` — tolerant: garbage in → `{}` or per-series reset, never a throw (a corrupt state file must degrade to "full re-sync", not a dead plugin)

- [ ] **Step 1: Write the failing test** — `src/sync/__tests__/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptySeriesState, parseSyncState } from "../state";

describe("parseSyncState", () => {
  it("passes valid state through", () => {
    const state = { s1: { lastContentHash: "h", notes: { single: { path: "a.md", hash: "v1:h" } } } };
    expect(parseSyncState(state)).toEqual(state);
  });
  it("returns empty state for garbage", () => {
    expect(parseSyncState(null)).toEqual({});
    expect(parseSyncState("nope")).toEqual({});
    expect(parseSyncState(42)).toEqual({});
  });
  it("resets a malformed series entry instead of throwing", () => {
    const state = { s1: { lastContentHash: 7, notes: "bad" }, s2: { lastContentHash: null, notes: {} } };
    const parsed = parseSyncState(state);
    expect(parsed.s1).toEqual(emptySeriesState());
    expect(parsed.s2).toEqual({ lastContentHash: null, notes: {} });
  });
  it("drops malformed note entries", () => {
    const parsed = parseSyncState({
      s1: { lastContentHash: "h", notes: { good: { path: "a.md", hash: "x" }, bad: { path: 1 } } },
    });
    expect(parsed.s1.notes).toEqual({ good: { path: "a.md", hash: "x" } });
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `src/sync/state.ts`:**

```ts
/** Per-note bookkeeping: where the note lives and the hash of what was last
 * written there (format `v<TEMPLATE_VERSION>:<serverHash>`). */
export type NoteState = { path: string; hash: string };
export type SeriesSyncState = { lastContentHash: string | null; notes: Record<string, NoteState> };
export type SyncState = Record<string, SeriesSyncState>;

export function emptySeriesState(): SeriesSyncState {
  return { lastContentHash: null, notes: {} };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Tolerant loader: any malformed slice degrades to "sync from scratch"
 * rather than throwing — a corrupt data.json must never brick the plugin. */
export function parseSyncState(raw: unknown): SyncState {
  if (!isRecord(raw)) return {};
  const out: SyncState = {};
  for (const [seriesId, value] of Object.entries(raw)) {
    if (!isRecord(value) || !isRecord(value.notes) || !("lastContentHash" in value)) {
      out[seriesId] = emptySeriesState();
      continue;
    }
    const hash = value.lastContentHash;
    const notes: Record<string, NoteState> = {};
    for (const [key, note] of Object.entries(value.notes)) {
      if (isRecord(note) && typeof note.path === "string" && typeof note.hash === "string") {
        notes[key] = { path: note.path, hash: note.hash };
      }
    }
    out[seriesId] = { lastContentHash: typeof hash === "string" ? hash : null, notes };
  }
  return out;
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit** — `git add src/sync && git commit -m "feat(state): tolerant sync-state model keyed by stable note ids"`

---

## Task 7: Diff planner

The heart of incremental sync: given a payload, the link config, and the previous state, emit the minimal op list. Pure function, no I/O.

**Files:**
- Create: `src/sync/plan.ts`
- Test: `src/sync/__tests__/plan.test.ts`

**Interfaces:**
- Consumes: Task 3 types, Task 4 `safeFileName`/`slugifyTitle`, Task 5 renderers + `TEMPLATE_VERSION`, Task 6 state types.
- Produces (used by Task 9):
  - `type LinkedSeries = { seriesId: string; title: string; folder: string; layout: "single" | "graph"; deleteMode: "archive" | "mirror" }` (defined HERE in plan.ts; settings.ts re-exports it)
  - `type SyncOp = { kind: "rename"; noteKey: string; from: string; to: string } | { kind: "write"; noteKey: string; path: string; content: string } | { kind: "remove"; noteKey: string; path: string; mode: "archive" | "mirror"; archivePath: string }`
  - `planSeriesSync(payload: ExportPayload, link: LinkedSeries, prev: SeriesSyncState, syncedAt: string): { ops: SyncOp[]; next: SeriesSyncState }`
- Op order guarantee: all renames first, then writes, then removes.
- Hash rule: note hash = `` `v${TEMPLATE_VERSION}:${serverHash}` `` where serverHash is `payload.contentHash` for `single`/`index`, `topic.hash` for topics, `entity.hash` for entities. Write when hash differs from `prev` OR the path moved (a moved note's body may embed its own name/links).
- Filename collisions (two topics/entities sanitizing to the same basename): first keeps the clean name, later ones get `` `${base} (${id.slice(0, 6)})` `` — deterministic given payload order.

- [ ] **Step 1: Write the failing test** — `src/sync/__tests__/plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ExportPayload } from "../../api/types";
import { emptySeriesState } from "../state";
import { planSeriesSync, type LinkedSeries } from "../plan";

const NOW = "2026-07-25T10:00:00Z";

function payload(overrides: Partial<ExportPayload> = {}): ExportPayload {
  return {
    series: { id: "s1", title: "Dad's Life", subjectName: "Peter", goal: "Capture it" },
    contentHash: "c1",
    topics: [
      { id: "t1", name: "Childhood", hash: "th1", facts: [{ statement: "F1", sessionLabel: "Session 1", timestamp: null, entities: [{ id: "e1", name: "Rosa", kind: "person" }] }] },
      { id: "t2", name: "Career", hash: "th2", facts: [{ statement: "F2", sessionLabel: "Session 1", timestamp: null, entities: [] }] },
    ],
    entities: [{ id: "e1", name: "Rosa", kind: "person", detail: null, hash: "eh1" }],
    summaries: [],
    timeline: [],
    ...overrides,
  };
}

const GRAPH: LinkedSeries = { seriesId: "s1", title: "Dad's Life", folder: "PostAud/Dad's Life", layout: "graph", deleteMode: "archive" };
const SINGLE: LinkedSeries = { ...GRAPH, layout: "single" };

describe("planSeriesSync — first sync", () => {
  it("graph layout creates index + one note per topic and entity", () => {
    const { ops, next } = planSeriesSync(payload(), GRAPH, emptySeriesState(), NOW);
    const writes = ops.filter((o) => o.kind === "write");
    expect(writes.map((w) => w.path).sort()).toEqual([
      "PostAud/Dad's Life/entities/Rosa.md",
      "PostAud/Dad's Life/index.md",
      "PostAud/Dad's Life/topics/Career.md",
      "PostAud/Dad's Life/topics/Childhood.md",
    ]);
    expect(next.lastContentHash).toBe("c1");
    expect(next.notes["topic:t1"]).toEqual({ path: "PostAud/Dad's Life/topics/Childhood.md", hash: "v1:th1" });
    expect(next.notes["entity:e1"].hash).toBe("v1:eh1");
    expect(next.notes["index"].hash).toBe("v1:c1");
  });
  it("single layout creates exactly one note", () => {
    const { ops } = planSeriesSync(payload(), SINGLE, emptySeriesState(), NOW);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "write", noteKey: "single", path: "PostAud/Dad's Life/dads-life.md" });
  });
});

describe("planSeriesSync — incremental", () => {
  const first = planSeriesSync(payload(), GRAPH, emptySeriesState(), NOW).next;

  it("unchanged payload plans zero ops", () => {
    const { ops } = planSeriesSync(payload(), GRAPH, first, NOW);
    expect(ops).toEqual([]);
  });

  it("one changed topic hash rewrites only that topic note (index untouched — contentHash drives it)", () => {
    const p = payload({ contentHash: "c2" });
    p.topics[0] = { ...p.topics[0], hash: "th1-changed" };
    const { ops } = planSeriesSync(p, GRAPH, first, NOW);
    expect(ops.map((o) => o.noteKey).sort()).toEqual(["index", "topic:t1"]);
    expect(ops.every((o) => o.kind === "write")).toBe(true);
  });

  it("a renamed topic renames the file and rewrites it", () => {
    const p = payload();
    p.topics[0] = { ...p.topics[0], name: "Early Years" };
    const { ops, next } = planSeriesSync(p, GRAPH, first, NOW);
    const rename = ops.find((o) => o.kind === "rename");
    expect(rename).toMatchObject({ from: "PostAud/Dad's Life/topics/Childhood.md", to: "PostAud/Dad's Life/topics/Early Years.md" });
    expect(ops.filter((o) => o.kind === "write").map((o) => o.noteKey)).toContain("topic:t1");
    expect(ops.indexOf(rename!)).toBe(0);
    expect(next.notes["topic:t1"].path).toBe("PostAud/Dad's Life/topics/Early Years.md");
  });

  it("a vanished entity is archived under _archive (archive mode)", () => {
    const p = payload({ entities: [], contentHash: "c3" });
    p.topics[0] = { ...p.topics[0], facts: [{ statement: "F1", sessionLabel: "Session 1", timestamp: null, entities: [] }], hash: "th1b" };
    const { ops, next } = planSeriesSync(p, GRAPH, first, NOW);
    const remove = ops.find((o) => o.kind === "remove");
    expect(remove).toMatchObject({
      noteKey: "entity:e1",
      path: "PostAud/Dad's Life/entities/Rosa.md",
      mode: "archive",
      archivePath: "PostAud/Dad's Life/_archive/Rosa.md",
    });
    expect(next.notes["entity:e1"]).toBeUndefined();
  });

  it("mirror mode marks the remove as mirror", () => {
    const p = payload({ entities: [], contentHash: "c3" });
    p.topics[0] = { ...p.topics[0], facts: [], hash: "th1c" };
    const { ops } = planSeriesSync(p, { ...GRAPH, deleteMode: "mirror" }, first, NOW);
    expect(ops.find((o) => o.kind === "remove")).toMatchObject({ mode: "mirror" });
  });

  it("switching layout replaces graph notes with the single note", () => {
    const { ops } = planSeriesSync(payload(), SINGLE, first, NOW);
    expect(ops.filter((o) => o.kind === "write").map((o) => o.noteKey)).toEqual(["single"]);
    const removed = ops.filter((o) => o.kind === "remove").map((o) => o.noteKey).sort();
    expect(removed).toEqual(["entity:e1", "index", "topic:t1", "topic:t2"]);
  });
});

describe("planSeriesSync — collisions", () => {
  it("disambiguates two entities that sanitize to the same filename", () => {
    const p = payload({
      entities: [
        { id: "aaaaaa1", name: "Rosa", kind: "person", detail: null, hash: "h1" },
        { id: "bbbbbb2", name: "Rosa?", kind: "place", detail: null, hash: "h2" },
      ],
    });
    const { next } = planSeriesSync(p, GRAPH, emptySeriesState(), NOW);
    expect(next.notes["entity:aaaaaa1"].path).toBe("PostAud/Dad's Life/entities/Rosa.md");
    expect(next.notes["entity:bbbbbb2"].path).toBe("PostAud/Dad's Life/entities/Rosa (bbbbbb).md");
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `src/sync/plan.ts`:**

```ts
import type { ExportPayload } from "../api/types";
import { renderEntityNote, renderIndexNote, renderSingleNote, renderTopicNote, TEMPLATE_VERSION } from "./render";
import { safeFileName, slugifyTitle } from "./slug";
import type { NoteState, SeriesSyncState } from "./state";

export type SeriesLayout = "single" | "graph";
export type DeleteMode = "archive" | "mirror";

export type LinkedSeries = {
  seriesId: string;
  title: string;
  folder: string;
  layout: SeriesLayout;
  deleteMode: DeleteMode;
};

export type SyncOp =
  | { kind: "rename"; noteKey: string; from: string; to: string }
  | { kind: "write"; noteKey: string; path: string; content: string }
  | { kind: "remove"; noteKey: string; path: string; mode: DeleteMode; archivePath: string };

type DesiredNote = { noteKey: string; path: string; hash: string; render: () => string };

function vHash(serverHash: string): string {
  return `v${TEMPLATE_VERSION}:${serverHash}`;
}

/** Deterministic collision-safe basenames: first claimant keeps the clean
 * name; later ones get " (<id prefix>)". */
function assignPaths<T extends { id: string | null; name: string }>(
  items: T[],
  dir: string,
): Map<T, string> {
  const taken = new Set<string>();
  const out = new Map<T, string>();
  for (const item of items) {
    const base = safeFileName(item.name);
    let name = base;
    if (taken.has(name.toLowerCase())) name = `${base} (${(item.id ?? "other").slice(0, 6)})`;
    taken.add(name.toLowerCase());
    out.set(item, `${dir}/${name}.md`);
  }
  return out;
}

export function planSeriesSync(
  payload: ExportPayload,
  link: LinkedSeries,
  prev: SeriesSyncState,
  syncedAt: string,
): { ops: SyncOp[]; next: SeriesSyncState } {
  const desired: DesiredNote[] = [];

  if (link.layout === "single") {
    desired.push({
      noteKey: "single",
      path: `${link.folder}/${slugifyTitle(payload.series.title)}.md`,
      hash: vHash(payload.contentHash),
      render: () => renderSingleNote(payload, syncedAt),
    });
  } else {
    const topicPaths = assignPaths(payload.topics, `${link.folder}/topics`);
    const entityPaths = assignPaths(payload.entities, `${link.folder}/entities`);
    const entityPathById = new Map(payload.entities.map((e) => [e.id, entityPaths.get(e)!]));
    const topicLinks = payload.topics.map((t) => ({ name: t.name, path: topicPaths.get(t)! }));
    desired.push({
      noteKey: "index",
      path: `${link.folder}/index.md`,
      hash: vHash(payload.contentHash),
      render: () => renderIndexNote(payload, topicLinks, entityPathById, syncedAt),
    });
    for (const topic of payload.topics) {
      desired.push({
        noteKey: `topic:${topic.id ?? "other"}`,
        path: topicPaths.get(topic)!,
        hash: vHash(topic.hash),
        render: () => renderTopicNote(topic, payload, entityPathById, syncedAt),
      });
    }
    for (const entity of payload.entities) {
      desired.push({
        noteKey: `entity:${entity.id}`,
        path: entityPaths.get(entity)!,
        hash: vHash(entity.hash),
        render: () => renderEntityNote(entity, payload, syncedAt),
      });
    }
  }

  const renames: SyncOp[] = [];
  const writes: SyncOp[] = [];
  const removes: SyncOp[] = [];
  const nextNotes: Record<string, NoteState> = {};
  const desiredKeys = new Set(desired.map((d) => d.noteKey));

  for (const note of desired) {
    const before = prev.notes[note.noteKey];
    const moved = before !== undefined && before.path !== note.path;
    if (moved) renames.push({ kind: "rename", noteKey: note.noteKey, from: before.path, to: note.path });
    if (before === undefined || moved || before.hash !== note.hash) {
      writes.push({ kind: "write", noteKey: note.noteKey, path: note.path, content: note.render() });
    }
    nextNotes[note.noteKey] = { path: note.path, hash: note.hash };
  }

  for (const [noteKey, before] of Object.entries(prev.notes)) {
    if (desiredKeys.has(noteKey)) continue;
    const basename = before.path.split("/").pop() as string;
    removes.push({
      kind: "remove",
      noteKey,
      path: before.path,
      mode: link.deleteMode,
      archivePath: `${link.folder}/_archive/${basename}`,
    });
  }

  return {
    ops: [...renames, ...writes, ...removes],
    next: { lastContentHash: payload.contentHash, notes: nextNotes },
  };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/sync/__tests__/plan.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/sync && git commit -m "feat(plan): hash-driven diff planner — minimal writes, renames by stable id, archive/mirror removes"`

---

## Task 8: VaultFs interface, ownership predicate, in-memory fake

**Files:**
- Create: `src/sync/vault-fs.ts`, `src/sync/memory-fs.ts`
- Test: `src/sync/__tests__/vault-fs.test.ts`

**Interfaces:**
- Produces (used by Tasks 9, 12):
  - `type VaultFs = { exists(path: string): Promise<boolean>; read(path: string): Promise<string>; write(path: string, content: string): Promise<void>; rename(from: string, to: string): Promise<void>; remove(path: string): Promise<void> }` — `write` creates parent folders; `rename` fails if target exists.
  - `isOwnedContent(content: string): boolean` — true iff the file opens with a YAML frontmatter block whose lines include `source: postaud.io`.
  - `class InMemoryVaultFs implements VaultFs` with a public `files: Map<string, string>` for assertions.

- [ ] **Step 1: Write the failing test** — `src/sync/__tests__/vault-fs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryVaultFs } from "../memory-fs";
import { isOwnedContent } from "../vault-fs";

describe("isOwnedContent", () => {
  it("accepts a file whose frontmatter carries the marker", () => {
    expect(isOwnedContent("---\nsource: postaud.io\nseries_id: s1\n---\n\n# Hi")).toBe(true);
  });
  it("rejects files without frontmatter or without the marker", () => {
    expect(isOwnedContent("# My own note mentioning source: postaud.io")).toBe(false);
    expect(isOwnedContent("---\ntitle: mine\n---\nsource: postaud.io")).toBe(false);
    expect(isOwnedContent("")).toBe(false);
  });
});

describe("InMemoryVaultFs", () => {
  it("round-trips write/read/exists/rename/remove", async () => {
    const fs = new InMemoryVaultFs();
    await fs.write("a/b/c.md", "hello");
    expect(await fs.exists("a/b/c.md")).toBe(true);
    expect(await fs.read("a/b/c.md")).toBe("hello");
    await fs.rename("a/b/c.md", "a/d.md");
    expect(await fs.exists("a/b/c.md")).toBe(false);
    expect(await fs.read("a/d.md")).toBe("hello");
    await fs.remove("a/d.md");
    expect(await fs.exists("a/d.md")).toBe(false);
  });
  it("rename onto an existing path throws", async () => {
    const fs = new InMemoryVaultFs();
    await fs.write("a.md", "1");
    await fs.write("b.md", "2");
    await expect(fs.rename("a.md", "b.md")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement.** `src/sync/vault-fs.ts`:

```ts
/** The only disk surface the sync engine touches. The real implementation
 * (obsidian-fs.ts) wraps app.vault.adapter; tests use InMemoryVaultFs. */
export type VaultFs = {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  /** Creates parent folders as needed; overwrites an existing file. */
  write(path: string, content: string): Promise<void>;
  /** Fails if `to` already exists. */
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
};

/** The vault-safety marker check: true iff the content opens with a YAML
 * frontmatter block one of whose lines is exactly `source: postaud.io`.
 * Anything else is a user's file and must never be touched. */
export function isOwnedContent(content: string): boolean {
  if (!content.startsWith("---\n")) return false;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return false;
  return content
    .slice(4, end)
    .split("\n")
    .some((line) => line.trim() === "source: postaud.io");
}
```

`src/sync/memory-fs.ts`:

```ts
import type { VaultFs } from "./vault-fs";

/** Test double — a Map pretending to be a vault. Folders are implicit. */
export class InMemoryVaultFs implements VaultFs {
  files = new Map<string, string>();

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`not found: ${path}`);
    return content;
  }
  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
  async rename(from: string, to: string): Promise<void> {
    if (this.files.has(to)) throw new Error(`target exists: ${to}`);
    const content = await this.read(from);
    this.files.delete(from);
    this.files.set(to, content);
  }
  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit** — `git add src/sync && git commit -m "feat(fs): VaultFs seam, ownership predicate, in-memory fake"`

---

## Task 9: Sync engine

Applies plans through the ownership guard and orchestrates the pending→fetch→plan→apply→ack cycle. This is where every safety rule converges, so its tests are the most important in the repo.

**Files:**
- Create: `src/sync/engine.ts`
- Test: `src/sync/__tests__/engine.test.ts`

**Interfaces:**
- Consumes: `PostAudClient` (Task 3), `planSeriesSync`/`LinkedSeries`/`SyncOp` (Task 7), `VaultFs`/`isOwnedContent` (Task 8), state types (Task 6).
- Produces (used by Tasks 10, 11):
  - `type ApplyResult = { wrote: number; skipped: string[] }` (`skipped` = paths refused by the ownership guard)
  - `applyPlan(fs: VaultFs, ops: SyncOp[]): Promise<ApplyResult>`
  - `type EngineDeps = { client: PostAudClient; fs: VaultFs; now(): string; log(msg: string): void }`
  - `type SeriesOutcome = { seriesId: string; title: string; wrote: number; skipped: string[]; acked: boolean; error: string | null }`
  - `syncOneSeries(deps: EngineDeps, link: LinkedSeries, prev: SeriesSyncState, opts: { force: boolean; requestedAt: string | null }): Promise<{ outcome: SeriesOutcome; next: SeriesSyncState | null }>` — `next: null` means "don't persist" (error case)
  - `runSync(deps: EngineDeps, links: LinkedSeries[], state: SyncState, opts: { force: boolean }): Promise<{ outcomes: SeriesOutcome[]; state: SyncState }>` — fetches pending once; when `force` is false only pending links sync; when true every link syncs (pending ones still ack)
- Guard semantics (in `applyPlan`): before **overwriting**, **renaming**, or **removing** an existing file, read it; if `isOwnedContent` is false → skip that op, record the path. Writes to a non-existent path need no guard. Archive moves: if the archive target exists, suffix the basename with `-1`, `-2`, … until free.
- Ack discipline (in `syncOneSeries`): ack iff `requestedAt !== null` AND apply finished without throwing. Guard-skips still ack (the sync completed; the skip is reported). Unchanged shortcut: when `!force` and `payload.contentHash === prev.lastContentHash` → no plan, no writes, still ack.

- [ ] **Step 1: Write the failing test** — `src/sync/__tests__/engine.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ExportPayload } from "../../api/types";
import { InMemoryVaultFs } from "../memory-fs";
import { emptySeriesState } from "../state";
import type { LinkedSeries } from "../plan";
import { applyPlan, runSync, syncOneSeries, type EngineDeps } from "../engine";

const NOW = "2026-07-25T10:00:00Z";
const LINK: LinkedSeries = { seriesId: "s1", title: "T", folder: "PostAud/T", layout: "single", deleteMode: "archive" };
const PAYLOAD: ExportPayload = {
  series: { id: "s1", title: "T", subjectName: "S", goal: "G" },
  contentHash: "c1",
  topics: [],
  entities: [],
  summaries: [],
  timeline: [],
};

function deps(fs: InMemoryVaultFs, client: Partial<EngineDeps["client"]>): EngineDeps {
  return {
    fs,
    now: () => NOW,
    log: () => {},
    client: {
      listSeries: vi.fn(), listPending: vi.fn(async () => []), fetchExport: vi.fn(async () => PAYLOAD),
      linkSeries: vi.fn(), unlinkSeries: vi.fn(), ack: vi.fn(),
      ...client,
    } as EngineDeps["client"],
  };
}

const OWNED = "---\nsource: postaud.io\nseries_id: s1\n---\n\nold";

describe("applyPlan — ownership guard", () => {
  it("never overwrites, renames, or removes an unowned file", async () => {
    const fs = new InMemoryVaultFs();
    await fs.write("a.md", "# my own note");
    await fs.write("b.md", "# mine too");
    await fs.write("c.md", "# and mine");
    const result = await applyPlan(fs, [
      { kind: "rename", noteKey: "k1", from: "b.md", to: "b2.md" },
      { kind: "write", noteKey: "k2", path: "a.md", content: OWNED },
      { kind: "remove", noteKey: "k3", path: "c.md", mode: "mirror", archivePath: "x/_archive/c.md" },
    ]);
    expect(await fs.read("a.md")).toBe("# my own note");
    expect(await fs.exists("b.md")).toBe(true);
    expect(await fs.read("c.md")).toBe("# and mine");
    expect(result.skipped.sort()).toEqual(["a.md", "b.md", "c.md"]);
    expect(result.wrote).toBe(0);
  });

  it("writes fresh files, overwrites owned ones, archives with collision suffix", async () => {
    const fs = new InMemoryVaultFs();
    await fs.write("PostAud/T/old.md", OWNED);
    await fs.write("PostAud/T/_archive/old.md", OWNED);
    const result = await applyPlan(fs, [
      { kind: "write", noteKey: "k1", path: "PostAud/T/new.md", content: OWNED },
      { kind: "write", noteKey: "k2", path: "PostAud/T/old.md", content: OWNED + "2" },
      { kind: "remove", noteKey: "k2", path: "PostAud/T/old.md", mode: "archive", archivePath: "PostAud/T/_archive/old.md" },
    ]);
    expect(result.wrote).toBe(2);
    expect(await fs.exists("PostAud/T/_archive/old-1.md")).toBe(true);
    expect(await fs.exists("PostAud/T/old.md")).toBe(false);
  });
});

describe("syncOneSeries", () => {
  it("first sync writes and acks with the exact requestedAt", async () => {
    const fs = new InMemoryVaultFs();
    const d = deps(fs, {});
    const { outcome, next } = await syncOneSeries(d, LINK, emptySeriesState(), { force: false, requestedAt: "REQ_TS" });
    expect(outcome).toMatchObject({ wrote: 1, acked: true, error: null });
    expect(d.client.ack).toHaveBeenCalledWith("s1", "REQ_TS");
    expect(next?.lastContentHash).toBe("c1");
    expect(await fs.exists("PostAud/T/t.md")).toBe(true);
  });

  it("unchanged contentHash acks with zero writes", async () => {
    const fs = new InMemoryVaultFs();
    const d = deps(fs, {});
    const first = (await syncOneSeries(d, LINK, emptySeriesState(), { force: false, requestedAt: null })).next!;
    const { outcome } = await syncOneSeries(d, LINK, first, { force: false, requestedAt: "REQ2" });
    expect(outcome.wrote).toBe(0);
    expect(d.client.ack).toHaveBeenLastCalledWith("s1", "REQ2");
  });

  it("a fetch failure produces an error outcome, no ack, no state change", async () => {
    const fs = new InMemoryVaultFs();
    const d = deps(fs, { fetchExport: vi.fn(async () => { throw new Error("boom"); }) });
    const { outcome, next } = await syncOneSeries(d, LINK, emptySeriesState(), { force: false, requestedAt: "REQ" });
    expect(outcome.error).toContain("boom");
    expect(outcome.acked).toBe(false);
    expect(next).toBeNull();
    expect(d.client.ack).not.toHaveBeenCalled();
  });

  it("without a pending requestedAt it syncs but never acks", async () => {
    const d = deps(new InMemoryVaultFs(), {});
    const { outcome } = await syncOneSeries(d, LINK, emptySeriesState(), { force: true, requestedAt: null });
    expect(outcome.acked).toBe(false);
    expect(d.client.ack).not.toHaveBeenCalled();
  });
});

describe("runSync", () => {
  it("non-force syncs only pending links; force syncs all", async () => {
    const links: LinkedSeries[] = [LINK, { ...LINK, seriesId: "s2", folder: "PostAud/T2" }];
    const pending = [{ seriesId: "s1", title: "T", requestedAt: "REQ" }];
    const d1 = deps(new InMemoryVaultFs(), { listPending: vi.fn(async () => pending) });
    const r1 = await runSync(d1, links, {}, { force: false });
    expect(r1.outcomes.map((o) => o.seriesId)).toEqual(["s1"]);
    const d2 = deps(new InMemoryVaultFs(), { listPending: vi.fn(async () => pending) });
    const r2 = await runSync(d2, links, {}, { force: true });
    expect(r2.outcomes.map((o) => o.seriesId).sort()).toEqual(["s1", "s2"]);
    expect(d2.client.ack).toHaveBeenCalledTimes(1);
    expect(r2.state.s1).toBeDefined();
    expect(r2.state.s2).toBeDefined();
  });

  it("a pending-endpoint failure returns zero outcomes instead of throwing", async () => {
    const d = deps(new InMemoryVaultFs(), { listPending: vi.fn(async () => { throw new Error("net"); }) });
    const r = await runSync(d, [LINK], {}, { force: false });
    expect(r.outcomes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `src/sync/engine.ts`:**

```ts
import type { PostAudClient } from "../api/client";
import { planSeriesSync, type LinkedSeries, type SyncOp } from "./plan";
import { emptySeriesState, type SeriesSyncState, type SyncState } from "./state";
import { isOwnedContent, type VaultFs } from "./vault-fs";

export type ApplyResult = { wrote: number; skipped: string[] };

/** True iff we may modify/replace/remove whatever exists at `path`.
 * Missing file → fine (nothing to protect). Present file → must be ours. */
async function mayTouch(fs: VaultFs, path: string): Promise<boolean> {
  if (!(await fs.exists(path))) return true;
  return isOwnedContent(await fs.read(path));
}

async function freeArchivePath(fs: VaultFs, wanted: string): Promise<string> {
  if (!(await fs.exists(wanted))) return wanted;
  const dot = wanted.lastIndexOf(".md");
  const stem = wanted.slice(0, dot);
  for (let i = 1; ; i++) {
    const candidate = `${stem}-${i}.md`;
    if (!(await fs.exists(candidate))) return candidate;
  }
}

/** The ONLY function that touches the vault. Every destructive interaction
 * passes the ownership guard here — no caller may bypass it. */
export async function applyPlan(fs: VaultFs, ops: SyncOp[]): Promise<ApplyResult> {
  const result: ApplyResult = { wrote: 0, skipped: [] };
  for (const op of ops) {
    if (op.kind === "rename") {
      if (!(await mayTouch(fs, op.from)) || !(await mayTouch(fs, op.to))) {
        result.skipped.push((await mayTouch(fs, op.from)) ? op.to : op.from);
        continue;
      }
      if (await fs.exists(op.from)) await fs.rename(op.from, op.to);
    } else if (op.kind === "write") {
      if (!(await mayTouch(fs, op.path))) {
        result.skipped.push(op.path);
        continue;
      }
      await fs.write(op.path, op.content);
      result.wrote += 1;
    } else {
      if (!(await mayTouch(fs, op.path))) {
        result.skipped.push(op.path);
        continue;
      }
      if (!(await fs.exists(op.path))) continue;
      if (op.mode === "archive") {
        await fs.rename(op.path, await freeArchivePath(fs, op.archivePath));
      } else {
        await fs.remove(op.path);
      }
    }
  }
  return result;
}

export type EngineDeps = {
  client: PostAudClient;
  fs: VaultFs;
  now(): string;
  log(msg: string): void;
};

export type SeriesOutcome = {
  seriesId: string;
  title: string;
  wrote: number;
  skipped: string[];
  acked: boolean;
  error: string | null;
};

export async function syncOneSeries(
  deps: EngineDeps,
  link: LinkedSeries,
  prev: SeriesSyncState,
  opts: { force: boolean; requestedAt: string | null },
): Promise<{ outcome: SeriesOutcome; next: SeriesSyncState | null }> {
  const base: SeriesOutcome = { seriesId: link.seriesId, title: link.title, wrote: 0, skipped: [], acked: false, error: null };
  try {
    const payload = await deps.client.fetchExport(link.seriesId);
    let next = prev;
    if (opts.force || payload.contentHash !== prev.lastContentHash) {
      const { ops, next: planned } = planSeriesSync(payload, link, prev, deps.now());
      const applied = await applyPlan(deps.fs, ops);
      base.wrote = applied.wrote;
      base.skipped = applied.skipped;
      next = planned;
    }
    if (opts.requestedAt !== null) {
      await deps.client.ack(link.seriesId, opts.requestedAt);
      base.acked = true;
    }
    return { outcome: base, next };
  } catch (err) {
    // No ack, no state persist: the pending flag stays raised so the next
    // trigger retries this series from scratch.
    return { outcome: { ...base, error: err instanceof Error ? err.message : String(err) }, next: null };
  }
}

/** One full trigger cycle. `force: false` = flag-driven (pending links only);
 * `force: true` = manual "Sync now" (all links; pending ones still ack). */
export async function runSync(
  deps: EngineDeps,
  links: LinkedSeries[],
  state: SyncState,
  opts: { force: boolean },
): Promise<{ outcomes: SeriesOutcome[]; state: SyncState }> {
  let pending: Map<string, string>;
  try {
    pending = new Map((await deps.client.listPending()).map((p) => [p.seriesId, p.requestedAt]));
  } catch (err) {
    deps.log(`pending check failed: ${err instanceof Error ? err.message : String(err)}`);
    return { outcomes: [], state };
  }

  const nextState: SyncState = { ...state };
  const outcomes: SeriesOutcome[] = [];
  for (const link of links) {
    const requestedAt = pending.get(link.seriesId) ?? null;
    if (!opts.force && requestedAt === null) continue;
    const prev = state[link.seriesId] ?? emptySeriesState();
    const { outcome, next } = await syncOneSeries(deps, link, prev, { force: opts.force, requestedAt });
    outcomes.push(outcome);
    if (next !== null) nextState[link.seriesId] = next;
  }
  return { outcomes, state: nextState };
}
```

- [ ] **Step 4: Run the full suite** — `npx vitest run` → ALL PASS.

- [ ] **Step 5: Commit** — `git add src/sync && git commit -m "feat(engine): guarded plan application + pending-driven sync cycle with strict ack discipline"`

---

## Task 10: Settings module + link modal

**Files:**
- Create: `src/settings.ts`
- Test: `src/__tests__/settings.test.ts` (pure helpers only — the tab UI is exercised manually)

**Interfaces:**
- Consumes: `LinkedSeries` (Task 7), `PostAudClient` (Task 3).
- Produces (used by Task 11):
  - `type PluginData = { settings: PluginSettings; syncState: unknown }` where `type PluginSettings = { baseUrl: string; token: string; links: LinkedSeries[]; companionNoticeShown: boolean }`
  - `DEFAULT_SETTINGS: PluginSettings` (`baseUrl: "https://postaud.io"`, empty token/links, notice unshown)
  - `parseSettings(raw: unknown): PluginSettings` — tolerant like `parseSyncState`
  - `defaultFolderFor(title: string): string` — `` `PostAud/${safeFileName(title)}` ``
  - `class PostAudSettingTab extends PluginSettingTab` — constructed with the plugin instance; the plugin exposes `getClient(): PostAudClient | null`, `saveAll(): Promise<void>`, `runManualSync(): Promise<void>` (Task 11 defines them)
- Settings tab contents (all built with Obsidian `Setting`):
  1. **Server URL** text field → `settings.baseUrl`.
  2. **Access token** text field with `inputEl.type = "password"`, description linking to `https://postaud.io/app/settings/tokens`.
  3. **Test connection** button → `getClient().listSeries()`; `new Notice("Connected — N series visible")` on success, `new Notice("Connection failed: …")` on error (401 → "token rejected — create a new one at postaud.io → Settings → Access tokens").
  4. **Linked series** — one `Setting` row per `settings.links[i]`: name = title, desc = `folder · layout · deleteMode`, buttons: **Sync now** (calls `runManualSync()`), **Unlink** (calls `client.unlinkSeries`, splices the link, `saveAll()`, re-renders; on API failure still unlink locally but Notice the failure).
  5. **Link a series…** button → opens `LinkSeriesModal`.
- `LinkSeriesModal extends Modal`: on open, `client.listSeries()`, filter out already-linked ids; dropdown of the rest; text field folder (prefilled `defaultFolderFor(title)`, updates when the dropdown changes if untouched); dropdown layout (`graph` default — labelled "Linked graph (recommended)" / "Single note"); dropdown delete-mode (`archive` default — "Archive removed notes (safe)" / "Mirror deletions exactly"); **Link** button → `client.linkSeries(id, label)` with `` label = `${this.app.vault.getName()} / ${folder}` ``, push `{ seriesId, title, folder, layout, deleteMode }` into `settings.links`, `saveAll()`, close, re-render the tab.

- [ ] **Step 1: Write the failing test** — `src/__tests__/settings.test.ts` (pure parts only; do NOT import the tab class here — importing `obsidian` breaks vitest, so put the pure helpers ABOVE the obsidian import boundary; see Step 3):

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, defaultFolderFor, parseSettings } from "../settings-core";

describe("parseSettings", () => {
  it("returns defaults for garbage", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("x")).toEqual(DEFAULT_SETTINGS);
  });
  it("keeps valid fields and drops malformed links", () => {
    const parsed = parseSettings({
      baseUrl: "http://localhost:3000",
      token: "pat_x",
      companionNoticeShown: true,
      links: [
        { seriesId: "s1", title: "T", folder: "F", layout: "graph", deleteMode: "archive" },
        { seriesId: "s2", layout: "bogus" },
      ],
    });
    expect(parsed.baseUrl).toBe("http://localhost:3000");
    expect(parsed.token).toBe("pat_x");
    expect(parsed.links).toHaveLength(1);
    expect(parsed.links[0].seriesId).toBe("s1");
  });
});

describe("defaultFolderFor", () => {
  it("nests under PostAud with a safe name", () => {
    expect(defaultFolderFor('Dad: "Life"')).toBe("PostAud/Dad Life");
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement.** Split into two files so the pure half stays testable:

`src/settings-core.ts` (NO obsidian import):

```ts
import type { DeleteMode, LinkedSeries, SeriesLayout } from "./sync/plan";
import { safeFileName } from "./sync/slug";

export type PluginSettings = {
  baseUrl: string;
  token: string;
  links: LinkedSeries[];
  companionNoticeShown: boolean;
};

export const DEFAULT_SETTINGS: PluginSettings = {
  baseUrl: "https://postaud.io",
  token: "",
  links: [],
  companionNoticeShown: false,
};

export function defaultFolderFor(title: string): string {
  return `PostAud/${safeFileName(title)}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isLayout(v: unknown): v is SeriesLayout {
  return v === "single" || v === "graph";
}
function isDeleteMode(v: unknown): v is DeleteMode {
  return v === "archive" || v === "mirror";
}

export function parseSettings(raw: unknown): PluginSettings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS, links: [] };
  const links: LinkedSeries[] = [];
  if (Array.isArray(raw.links)) {
    for (const l of raw.links) {
      if (
        isRecord(l) &&
        typeof l.seriesId === "string" &&
        typeof l.title === "string" &&
        typeof l.folder === "string" &&
        isLayout(l.layout) &&
        isDeleteMode(l.deleteMode)
      ) {
        links.push({ seriesId: l.seriesId, title: l.title, folder: l.folder, layout: l.layout, deleteMode: l.deleteMode });
      }
    }
  }
  return {
    baseUrl: typeof raw.baseUrl === "string" && raw.baseUrl.trim() ? raw.baseUrl.trim() : DEFAULT_SETTINGS.baseUrl,
    token: typeof raw.token === "string" ? raw.token : "",
    links,
    companionNoticeShown: raw.companionNoticeShown === true,
  };
}
```

`src/settings.ts` (obsidian import allowed) — implement `PostAudSettingTab` and `LinkSeriesModal` exactly per the interface block above. Skeleton (fill every `Setting` per the numbered list — this is UI wiring, not logic):

```ts
import { Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type PostAudPlugin from "./main";
import { defaultFolderFor } from "./settings-core";
import type { DeleteMode, SeriesLayout } from "./sync/plan";

export class PostAudSettingTab extends PluginSettingTab {
  constructor(private plugin: PostAudPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Server URL")
      .setDesc("Leave as postaud.io unless you run a dev server.")
      .addText((t) =>
        t.setValue(this.plugin.settings.baseUrl).onChange(async (v) => {
          this.plugin.settings.baseUrl = v.trim() || "https://postaud.io";
          await this.plugin.saveAll();
        }),
      );

    new Setting(containerEl)
      .setName("Access token")
      .setDesc("Create one at postaud.io → Settings → Access tokens. Shown once — paste it here.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.settings.token).onChange(async (v) => {
          this.plugin.settings.token = v.trim();
          await this.plugin.saveAll();
        });
      });

    new Setting(containerEl).setName("Test connection").addButton((b) =>
      b.setButtonText("Test").onClick(async () => {
        const client = this.plugin.getClient();
        if (!client) return void new Notice("Paste your access token first.");
        try {
          const series = await client.listSeries();
          new Notice(`Connected — ${series.length} series visible.`);
        } catch (err) {
          new Notice(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );

    containerEl.createEl("h3", { text: "Linked series" });
    this.plugin.settings.links.forEach((link, i) => {
      new Setting(containerEl)
        .setName(link.title)
        .setDesc(`${link.folder} · ${link.layout} · ${link.deleteMode}`)
        .addButton((b) => b.setButtonText("Sync now").onClick(() => void this.plugin.runManualSync()))
        .addButton((b) =>
          b.setButtonText("Unlink").setWarning().onClick(async () => {
            try {
              await this.plugin.getClient()?.unlinkSeries(link.seriesId);
            } catch (err) {
              new Notice(`Server unlink failed (removed locally): ${err instanceof Error ? err.message : String(err)}`);
            }
            this.plugin.settings.links.splice(i, 1);
            await this.plugin.saveAll();
            this.display();
          }),
        );
    });

    new Setting(containerEl).addButton((b) =>
      b.setButtonText("Link a series…").setCta().onClick(() => {
        const client = this.plugin.getClient();
        if (!client) return void new Notice("Paste your access token first.");
        new LinkSeriesModal(this.plugin, () => this.display()).open();
      }),
    );
  }
}

class LinkSeriesModal extends Modal {
  private folderTouched = false;

  constructor(private plugin: PostAudPlugin, private onLinked: () => void) {
    super(plugin.app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Link a series" });
    const client = this.plugin.getClient()!;
    let all;
    try {
      all = await client.listSeries();
    } catch (err) {
      contentEl.createEl("p", { text: `Could not load series: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }
    const linked = new Set(this.plugin.settings.links.map((l) => l.seriesId));
    const candidates = all.filter((s) => !linked.has(s.id));
    if (candidates.length === 0) {
      contentEl.createEl("p", { text: "Every visible series is already linked." });
      return;
    }

    let seriesId = candidates[0].id;
    let folder = defaultFolderFor(candidates[0].title);
    let layout: SeriesLayout = "graph";
    let deleteMode: DeleteMode = "archive";
    let folderInput: HTMLInputElement | null = null;

    new Setting(contentEl).setName("Series").addDropdown((d) => {
      for (const s of candidates) d.addOption(s.id, `${s.title} (${s.subjectName})`);
      d.setValue(seriesId).onChange((v) => {
        seriesId = v;
        if (!this.folderTouched && folderInput) {
          folder = defaultFolderFor(candidates.find((c) => c.id === v)?.title ?? "Series");
          folderInput.value = folder;
        }
      });
    });

    new Setting(contentEl)
      .setName("Vault folder")
      .setDesc("Where this series' notes live. Created if missing.")
      .addText((t) => {
        folderInput = t.inputEl;
        t.setValue(folder).onChange((v) => {
          this.folderTouched = true;
          folder = v.trim();
        });
      });

    new Setting(contentEl).setName("Layout").addDropdown((d) =>
      d
        .addOption("graph", "Linked graph (recommended)")
        .addOption("single", "Single note")
        .setValue(layout)
        .onChange((v) => (layout = v as SeriesLayout)),
    );

    new Setting(contentEl).setName("When something is removed upstream").addDropdown((d) =>
      d
        .addOption("archive", "Archive removed notes (safe)")
        .addOption("mirror", "Mirror deletions exactly")
        .setValue(deleteMode)
        .onChange((v) => (deleteMode = v as DeleteMode)),
    );

    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Link").setCta().onClick(async () => {
        if (!folder) return void new Notice("Pick a folder.");
        const title = candidates.find((c) => c.id === seriesId)?.title ?? "Series";
        try {
          await client.linkSeries(seriesId, `${this.plugin.app.vault.getName()} / ${folder}`);
        } catch (err) {
          return void new Notice(`Link failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        this.plugin.settings.links.push({ seriesId, title, folder, layout, deleteMode });
        await this.plugin.saveAll();
        new Notice(`${title} linked — press "Send update to vault" in PostAud.io, or Sync now.`);
        this.close();
        this.onLinked();
      }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 4: Run tests + typecheck** — `npx vitest run src/__tests__/settings.test.ts && npx tsc --noEmit` → PASS (tsc validates the obsidian-importing half compiles).

- [ ] **Step 5: Commit** — `git add src && git commit -m "feat(settings): token + link management UI over a pure, tested settings core"`

---

## Task 11: Plugin shell (`main.ts`)

**Files:**
- Modify: `src/main.ts` (replaces the Task 2 placeholder)
- Create: `src/sync/obsidian-fs.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `export default class PostAudPlugin extends Plugin` with the members `settings: PluginSettings`, `syncState: SyncState`, `getClient(): PostAudClient | null`, `saveAll(): Promise<void>`, `runManualSync(): Promise<void>` that Task 10's tab consumes.
- Behavior contract:
  - `onload`: load data (`{ settings, syncState }` via `parseSettings`/`parseSyncState`), register the settings tab, add command `postaud-sync-now` ("PostAud.io: Sync now") → `runManualSync()`, register a `window` focus listener (via `registerDomEvent`) and an `onLayoutReady` initial check — both call `checkPending()` (force `false`), focus-throttled to once per 60s.
  - `checkPending()` / `runManualSync()`: no token or no links → silent return (manual → Notice explaining). Build deps (`client`, `ObsidianVaultFs`, `now: () => new Date().toISOString()`, `log: console.log`), `runSync`, persist state, then report: any outcome with `error` → `Notice("PostAud.io sync failed for <title>: <error>")`; wrote > 0 → `Notice("PostAud.io: <title> synced — N note(s) updated")`; guard skips → `Notice("PostAud.io: skipped N file(s) not owned by the plugin — see console")` + `console.warn` the paths. After the FIRST outcome ever with `wrote > 0` and `!settings.companionNoticeShown`: long-form Notice — "PostAud.io owns the notes it writes and will overwrite hand-edits on the next sync. Keep personal annotations in a separate companion note (e.g. `Rosa.notes.md`)." — then set the flag and save.
  - `http` adapter over Obsidian's `requestUrl` (never `fetch` — CORS): `{ url, method, headers, body } → requestUrl({ url, method, headers, body, throw: false })` then `{ status: res.status, json: res.json }` (wrap `res.json` access in try → `{}` for empty bodies).

- [ ] **Step 1: Implement `src/sync/obsidian-fs.ts`:**

```ts
import { normalizePath, type Vault } from "obsidian";
import type { VaultFs } from "./vault-fs";

/** Real VaultFs over the vault adapter. Kept too thin to test: every branch
 * here is a straight delegation; the logic lives behind the interface. */
export class ObsidianVaultFs implements VaultFs {
  constructor(private vault: Vault) {}

  exists(path: string): Promise<boolean> {
    return this.vault.adapter.exists(normalizePath(path));
  }
  read(path: string): Promise<string> {
    return this.vault.adapter.read(normalizePath(path));
  }
  async write(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    const dir = normalized.split("/").slice(0, -1).join("/");
    if (dir && !(await this.vault.adapter.exists(dir))) {
      await this.mkdirp(dir);
    }
    await this.vault.adapter.write(normalized, content);
  }
  async rename(from: string, to: string): Promise<void> {
    const target = normalizePath(to);
    const dir = target.split("/").slice(0, -1).join("/");
    if (dir && !(await this.vault.adapter.exists(dir))) {
      await this.mkdirp(dir);
    }
    await this.vault.adapter.rename(normalizePath(from), target);
  }
  remove(path: string): Promise<void> {
    return this.vault.adapter.remove(normalizePath(path));
  }
  private async mkdirp(dir: string): Promise<void> {
    const parts = dir.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.vault.adapter.exists(current))) {
        await this.vault.adapter.mkdir(current);
      }
    }
  }
}
```

- [ ] **Step 2: Implement `src/main.ts`:**

```ts
import { Notice, Plugin, requestUrl } from "obsidian";
import { PostAudClient, type HttpFn } from "./api/client";
import { DEFAULT_SETTINGS, parseSettings, type PluginSettings } from "./settings-core";
import { PostAudSettingTab } from "./settings";
import { runSync, type SeriesOutcome } from "./sync/engine";
import { ObsidianVaultFs } from "./sync/obsidian-fs";
import { parseSyncState, type SyncState } from "./sync/state";

const FOCUS_THROTTLE_MS = 60_000;

const obsidianHttp: HttpFn = async ({ url, method, headers, body }) => {
  const res = await requestUrl({ url, method, headers, body, throw: false });
  let json: unknown = {};
  try {
    json = res.json;
  } catch {
    // empty or non-JSON body — leave {}
  }
  return { status: res.status, json };
};

export default class PostAudPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS, links: [] };
  syncState: SyncState = {};
  private lastFocusCheck = 0;
  private syncing = false;

  async onload(): Promise<void> {
    const raw = ((await this.loadData()) ?? {}) as { settings?: unknown; syncState?: unknown };
    this.settings = parseSettings(raw.settings);
    this.syncState = parseSyncState(raw.syncState);

    this.addSettingTab(new PostAudSettingTab(this));

    this.addCommand({
      id: "postaud-sync-now",
      name: "Sync now",
      callback: () => void this.runManualSync(),
    });

    this.app.workspace.onLayoutReady(() => void this.checkPending());
    this.registerDomEvent(window, "focus", () => {
      const now = Date.now();
      if (now - this.lastFocusCheck < FOCUS_THROTTLE_MS) return;
      this.lastFocusCheck = now;
      void this.checkPending();
    });
  }

  getClient(): PostAudClient | null {
    if (!this.settings.token) return null;
    return new PostAudClient(obsidianHttp, this.settings.baseUrl, this.settings.token);
  }

  async saveAll(): Promise<void> {
    await this.saveData({ settings: this.settings, syncState: this.syncState });
  }

  private async doSync(force: boolean): Promise<void> {
    if (this.syncing) return;
    const client = this.getClient();
    if (!client || this.settings.links.length === 0) {
      if (force) new Notice("PostAud.io: add your access token and link a series in Settings first.");
      return;
    }
    this.syncing = true;
    try {
      const { outcomes, state } = await runSync(
        {
          client,
          fs: new ObsidianVaultFs(this.app.vault),
          now: () => new Date().toISOString(),
          log: (msg) => console.log(`postaud-io: ${msg}`),
        },
        this.settings.links,
        this.syncState,
        { force },
      );
      this.syncState = state;
      await this.saveAll();
      await this.report(outcomes);
    } finally {
      this.syncing = false;
    }
  }

  private async report(outcomes: SeriesOutcome[]): Promise<void> {
    let wroteAnything = false;
    for (const o of outcomes) {
      if (o.error) {
        new Notice(`PostAud.io sync failed for ${o.title}: ${o.error}`);
        continue;
      }
      if (o.wrote > 0) {
        wroteAnything = true;
        new Notice(`PostAud.io: ${o.title} synced — ${o.wrote} note${o.wrote === 1 ? "" : "s"} updated.`);
      }
      if (o.skipped.length > 0) {
        new Notice(`PostAud.io: skipped ${o.skipped.length} file(s) not owned by the plugin — see console.`);
        console.warn("postaud-io: ownership guard skipped:", o.skipped);
      }
    }
    if (wroteAnything && !this.settings.companionNoticeShown) {
      new Notice(
        "PostAud.io owns the notes it writes and will overwrite hand-edits on the next sync. " +
          "Keep personal annotations in a separate companion note (e.g. Rosa.notes.md).",
        15_000,
      );
      this.settings.companionNoticeShown = true;
      await this.saveAll();
    }
  }

  checkPending(): Promise<void> {
    return this.doSync(false);
  }

  runManualSync(): Promise<void> {
    return this.doSync(true);
  }
}
```

- [ ] **Step 3: Full check** — `npm run check && npm run build` → tsc clean, all tests pass, `main.js` builds.

- [ ] **Step 4: Commit** — `git add src main.js 2>/dev/null; git add src && git commit -m "feat(plugin): shell wiring — triggers, commands, notices, requestUrl transport, vault adapter"` (do NOT commit `main.js`; it's gitignored).

---

## Task 12: README + install into the real vault

**Files:**
- Create: `README.md`
- Deploy: copy build artifacts into `/Users/nickostroff/Obsidian Vault/nickostroff/.obsidian/plugins/postaud-io/`

- [ ] **Step 1: Write `README.md`** covering: what it does (one paragraph + the ownership guarantee), install via BRAT (`obsidian42-brat` → Add beta plugin → this repo URL) and manual install (copy `manifest.json` + `main.js` into `<vault>/.obsidian/plugins/postaud-io/`), the 4-step connect walkthrough (create token at postaud.io → Settings → Access tokens; paste in plugin settings; Test connection; Link a series), how syncing triggers (Send update to vault in PostAud.io → arrives on Obsidian open/focus, or Command palette → "PostAud.io: Sync now"), the archive-vs-mirror choice, and the companion-note convention. Also a Development section (`npm install`, `npm run dev`, `npm test`).

- [ ] **Step 2: Build and deploy locally**

```bash
npm run build
mkdir -p "/Users/nickostroff/Obsidian Vault/nickostroff/.obsidian/plugins/postaud-io"
cp manifest.json main.js "/Users/nickostroff/Obsidian Vault/nickostroff/.obsidian/plugins/postaud-io/"
```

- [ ] **Step 3: Commit** — `git add README.md && git commit -m "docs: install + connect walkthrough"`

- [ ] **Step 4: Manual QA checklist (requires Nick — the plugin needs his token):**
  1. Obsidian → Settings → Community plugins → enable "PostAud.io Vault Sync" (turn off Restricted mode if prompted).
  2. Plugin settings → paste the access token → **Test connection** → expect "Connected — N series visible".
  3. **Link a series…** → pick a small series → Linked graph → Link.
  4. In PostAud.io, open that series → Vault card → **Send update to vault**.
  5. Refocus Obsidian → expect the sync Notice; verify `PostAud/<title>/index.md`, `topics/…`, `entities/…` exist and the graph view shows entity links.
  6. Edit an owned note by hand, press Send + refocus with no upstream change → nothing rewrites (contentHash unchanged). Run "Sync now" (force) → the hand-edit is overwritten (expected; companion-note notice explains).
  7. Create `PostAud/<title>/topics/MyOwn.md` WITHOUT the marker; rename a topic upstream to collide with it → sync → the file must be skipped, with the guard Notice.
  8. Run another interview session in the series, Send, refocus → only the touched topic note (plus index) rewrites — check mtimes.

---

## Self-Review (completed during planning)

- **Spec coverage:** layouts ✓ (Task 5/7), ownership contract ✓ (Task 8/9, QA #7), flag-driven receive + triggers ✓ (Task 9/11), hash-incremental writes ✓ (Task 7, QA #8), archive/mirror ✓ (Task 7/9), renames by stable id ✓ (Task 1 adds the missing topic ids; Task 7 rename ops; entity renames also change per-topic hashes because fact entity names feed them, so inbound wikilinks regenerate), conflict stance + companion notice ✓ (Task 11), settings/link flow with `label` ✓ (Task 10), state file in plugin data (not vault) ✓ (Task 11 `saveData`), ack echo discipline ✓ (Task 9), unchanged→still-ack ✓ (Task 9).
- **Known deviations from spec (accepted):** state lives in Obsidian's standard `data.json` rather than a literal `.postaud-sync.json` (same location class, idiomatic); the spec's "session list" on index.md is the summaries list (the payload has no separate session records); org/event entities have no notes (server export surfaces only person/place/date) and render as plain text in fact lines.
- **Type consistency:** `LinkedSeries` is defined once in `plan.ts` and imported by settings-core/settings/engine; `HttpFn` defined once in `api/client.ts`; note-key format `topic:<id ?? "other">` used identically in plan.ts and state docs; `SeriesOutcome`/`runSync` signatures match between Task 9 and Task 11.
