# Obsidian Vault Sync — Design

**Date:** 2026-07-18
**Status:** Design approved, spec under review
**Feature:** Let PostAud.io users link a series to their Obsidian vault (or any Markdown-based "memory bank") and keep it mirrored as new interviews add knowledge.

## Goal

A PostAud.io user can connect a series to a folder in their Obsidian vault and have the series' knowledge base appear there as Markdown — refreshing automatically as new facts are extracted. One-way (PostAud.io → vault), safe by default, never destroys a user's own notes.

## Decisions (locked during brainstorming)

- **Audience:** product feature for all users (not a personal one-off).
- **Direction:** one-way, PostAud.io → vault. PostAud.io is the source of truth. Matches the existing model (immutable transcripts, LLM-derived knowledge base). A future "annotate without mutating" step is left open but out of scope.
- **Vault shape:** user chooses per series — **Single note** or **Linked graph**.
- **Mechanism:** an official Obsidian community plugin built on top of a new PostAud.io API foundation (personal access tokens + a machine-readable export endpoint).

## Why a plugin on top of an API

An Obsidian vault is just a local folder of `.md` files with no cloud API, so "linking" always reduces to *something writes files into that folder*. Three delivery options were considered:

| Option | UX | Verdict |
|---|---|---|
| **A. Obsidian plugin** | Paste token, pick series + folder + layout, auto-sync | **Chosen** — only option with a "click to connect" UX for non-technical users |
| B. Local CLI / launchd agent | `npx postaud-sync`, terminal | Power-user path; enabled for free by the same API, but wrong primary UX |
| C. Git mirror + Obsidian Git | PostAud pushes to GitHub, user pulls | Too much setup friction as the primary path |

The token + export API is the load-bearing ~80% of the work. The plugin is a thin client. B and C become nearly-free follow-ons because they consume the identical API — so choosing A does not lock anyone out.

**Cost accepted:** a second small codebase (the plugin, separate repo) and the Obsidian community-store submission. All server-side work is identical regardless of which delivery option ships.

## Architecture

```
Obsidian plugin (separate repo, TypeScript)
  │  Authorization: Bearer pat_…
  ▼
PostAud.io API
  ├─ GET /api/series?format=json                 (discovery: list linkable series)
  ├─ GET /api/series/[id]/export?format=json     (structured knowledge + hashes)
  └─ token resolver → user → existing RLS         (no new authz surface)
```

Server stays "dumb and stable": it emits structured data + content hashes. **All Markdown/graph shaping lives in the plugin**, so layout changes never require a PostAud.io deploy.

## Server work (in PostAud.io)

### 2a. Personal access tokens

New table `api_tokens`:

| column | notes |
|---|---|
| `id` | uuid pk |
| `user_id` | fk → users |
| `token_hash` | SHA-256 of the token; raw token shown once, never stored |
| `name` | user label, e.g. "Obsidian – laptop" |
| `last_used_at` | nullable |
| `created_at` | |
| `revoked_at` | nullable |

- Token format `pat_<random>`; displayed once on creation.
- Settings page `/app/settings/tokens`: create, list (name + last used), revoke.
- Auth path: `Authorization: Bearer pat_…` → resolver hashes, looks up non-revoked row, sets `last_used_at`, yields the `user_id`. Requests then run through the **existing** Supabase RLS — a token can only reach series its owner could already see. No new authorization logic, just a new way to establish identity.
- This is the security-sensitive piece (new auth surface) and gets the careful review.

### 2b. Structured export endpoint

Extend the existing `src/app/api/series/[id]/export/route.ts`:

- Add `format=json` alongside the current `md`/`txt`.
- Returns the **already-computed** structure that route assembles for the Markdown renderer: series meta (`title`, `subject_name`, `goal`), `summaries`, `factsByTopic`, `people`, `places`, `timeline`, plus each fact's linked `entities` (already present via `getSeriesKnowledge`).
- Add hashes for incremental sync:
  - top-level `contentHash` (whole series),
  - per-topic hash and per-entity hash.
- Nearly no new logic — same data, emitted as JSON instead of rendered Markdown. Superseded facts stay excluded (same invariant the md export already enforces).

### 2c. Discovery endpoint

`GET /api/series?format=json` — list the token owner's series (`id`, `title`, `subject_name`, updated marker) so the plugin can present a pick list.

## Plugin work (separate repo)

### Layouts (per-series setting)

**Single note** — `<Folder>/<series-slug>.md`:
- Frontmatter: `title`, `subject`, `source: postaud.io`, `series_id`, `synced_at`.
- Body: summaries, facts by topic, people/places, timeline (same sections as today's export).

**Linked graph** — one folder per series:
```
<Folder>/<Series Title>/
  index.md              hub: goal, subject, session list, links to topic notes
  topics/Childhood.md   topic note — its facts, each linking mentioned entities
  topics/Career.md
  entities/Rosa.md      #person   (frontmatter kind: person)
  entities/Detroit.md   #place
  entities/1961.md      #date
```
- Facts render `[[Rosa]]` / `[[Detroit]]` wikilinks from the `fact.entities` join.
- Entity notes carry a tag (`#person` / `#place` / `#date`) and their `detail`, so Obsidian's graph + backlinks light up and a memory bank can traverse people across series.

### The ownership contract

**Every file the plugin writes carries `source: postaud.io` in frontmatter** plus the `series_id`/entity id it came from. The plugin only ever reads, rewrites, moves, or deletes files bearing that marker. Any file without it — a user's own notes in the same folder — is invisible to the plugin and can never be touched. This is the core vault-safety guarantee.

### Refresh (poll + hash diff)

1. Plugin keeps a local state file (`.postaud-sync.json` in plugin data, **not** in the vault) mapping `series_id → last contentHash` and `topic/entity id → { path, hash }`.
2. Sync trigger: manual button + configurable interval (e.g. every 30 min while Obsidian is open). Calls `export?format=json`, compares top-level `contentHash`. Unchanged → zero writes.
3. Changed → walk per-topic / per-entity hashes and **rewrite only the notes whose hash moved.** (New interview adds facts to "Career" → only `Career.md` is rewritten.) Untouched notes keep their mtimes and git history.

### Deletions & supersession (user-chosen mode)

When a fact/entity disappears upstream (superseded by the merge pipeline):
- **Archive (default):** move the orphaned owned note to `<Folder>/_archive/`. Nothing is destroyed.
- **Mirror:** delete owned notes that no longer exist upstream for a true 1:1 mirror. Only ever touches `source: postaud.io` files.

### Renames

Files are addressed by stable id in the state map, not by title. Rename a series/topic in PostAud.io → plugin renames its own note and rewrites inbound `[[wikilinks]]`; never creates a duplicate.

### Conflict stance

One-way: PostAud.io wins for owned files. A hand-edit to an owned note is overwritten on next sync. The plugin shows a one-time notice recommending personal annotations live in a **companion** note (e.g. `Rosa.notes.md`, no `source` marker) that sync never touches. This companion-note seam is where a future "annotate without mutating" capability plugs in.

## Testing

**Server (Vitest, existing suite):**
- Token resolver: valid `pat_…` → correct user; revoked / garbage / missing → 401; token for user A cannot read user B's series (RLS passthrough proven).
- `export?format=json`: shape matches the md route's data; `contentHash` stable across identical calls, changes when a fact is added/superseded; superseded facts excluded.
- `series?format=json`: lists only the token owner's series.

**Plugin (its own repo):**
- Shaping: JSON fixture → asserted file tree for both layouts; wikilinks resolve to the right entity notes.
- Diff engine: unchanged hash → zero writes; one changed topic → exactly one file rewritten; superseded fact → archive vs. mirror per setting.
- Ownership guard: a non-`source` file in the target folder is never modified or deleted.

**Manual QA:** real vault — link a series, run an interview, re-sync, confirm only the changed note updates and the graph view shows entity links.

## Out of scope (V1)

- Two-way sync / editing facts from the vault.
- Companion-note annotation surfacing back in PostAud.io (seam left open).
- CLI (option B) and Git mirror (option C) — enabled by the same API, shipped later if wanted.
- Community-store listing can follow BRAT sideloading; not a launch blocker.

## Build order

1. Server: `api_tokens` table + migration, token resolver, `/app/settings/tokens` UI.
2. Server: `export?format=json` + hashes, `series?format=json` discovery.
3. Plugin repo scaffold: settings (token, series pick, folder, layout, delete-mode), discovery + fetch.
4. Plugin: layout renderers (single + graph), diff engine, ownership guard, archive/mirror, rename handling.
5. Tests (server + plugin), manual vault QA.
