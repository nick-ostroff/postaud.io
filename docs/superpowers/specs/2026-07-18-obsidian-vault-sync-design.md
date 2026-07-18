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
- **Trigger model:** **user-initiated push from PostAud.io** — not auto-polling. The user connects a series to a vault location once (in the plugin), then presses **"Send update to vault"** in the PostAud.io UI whenever they want. That flags the series as *update ready*; the plugin receives it the next time Obsidian is open/focused (or on a manual "Sync now"). Nothing is ever sent automatically.

### The one hard constraint

PostAud.io is a cloud server; an Obsidian vault is a folder on the user's own device. **A cloud server cannot write to a user's local disk.** So "push" means: the user presses a button in PostAud.io, which sets a *pending* flag server-side; the local plugin is the receiver that acts on that flag. The initiation lives in PostAud.io (as the user wants); the local write necessarily happens through the plugin.

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
PostAud.io web UI (series page)
  [ Send update to vault → ]  ── sets push_requested_at (pending flag)

Obsidian plugin (separate repo, TypeScript)
  │  Authorization: Bearer pat_…
  │  on Obsidian focus / open / manual "Sync now":
  ▼
PostAud.io API
  ├─ GET  /api/vault/pending                      (which linked series are update-ready?)
  ├─ GET  /api/series?format=json                 (discovery: list linkable series)
  ├─ POST /api/series/[id]/vault-link             (plugin marks a series linked; label only)
  ├─ GET  /api/series/[id]/export?format=json     (structured knowledge + hashes)
  ├─ POST /api/series/[id]/vault-ack              (plugin clears the flag after writing)
  └─ token resolver → user → existing RLS          (no new authz surface)
```

Flow: user presses **Send** in PostAud.io → server stamps `push_requested_at`. Next time Obsidian is open/focused, the plugin calls `/api/vault/pending`, sees the series is ready, pulls `export?format=json`, writes only changed files, then acks to clear the flag. The vault's local folder path + layout live **only in the plugin** (the server never knows a local path); the server only tracks *that* a series is linked and *whether* an update is pending.

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

### 2d. Vault link + push flag (the user-initiated trigger)

New table `series_vault_links` (one row per linked series, per user):

| column | notes |
|---|---|
| `series_id` | fk → series |
| `user_id` | fk → users (RLS scope) |
| `label` | friendly destination name the plugin sends, e.g. "My Vault / PostAud" (server never stores the local path) |
| `linked_at` | |
| `push_requested_at` | nullable — stamped when the user presses "Send update to vault" |
| `last_acked_at` | nullable — stamped when the plugin confirms it wrote the update |

Endpoints:
- `POST /api/series/[id]/vault-link` — plugin marks a series linked (sends `label`). Idempotent upsert. Enables the UI card + Send button.
- `DELETE /api/series/[id]/vault-link` — unlink (from either side).
- `GET /api/vault/pending` — returns linked series where `push_requested_at > last_acked_at` (i.e. an update the plugin hasn't taken yet). The plugin's cheap poll target.
- `POST /api/series/[id]/vault-ack` — plugin calls this after writing; stamps `last_acked_at`, clearing the pending state.

**UI (PostAud.io series page):** a "Vault" card. When unlinked: instructions to install the plugin. When linked: shows the destination `label`, `last_acked_at` ("Last sent …"), and the primary **"Send update to vault"** button, which stamps `push_requested_at`. After a press, the card reads "Update queued — will arrive next time Obsidian is open" until the plugin acks.

`push_requested_at` is a single latest-wins timestamp, not a queue — pressing Send twice before the plugin picks it up just means one delivery of the current state, which is correct for a mirror.

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

### Receive (flag-driven, then hash diff)

The plugin never sends on its own schedule — it acts only on a pending flag the **user** raised in PostAud.io.

1. Plugin keeps a local state file (`.postaud-sync.json` in plugin data, **not** in the vault) mapping each linked `series_id → { localFolder, layout, deleteMode, lastContentHash }` and `topic/entity id → { path, hash }`.
2. **Check triggers** (cheap, no continuous polling): on Obsidian open, on window focus, and a manual "Sync now" command. Each check is one call to `GET /api/vault/pending`.
3. For each pending series: pull `export?format=json`, compare top-level `contentHash`. Unchanged → still ack (clears the flag), zero writes.
4. Changed → walk per-topic / per-entity hashes and **rewrite only the notes whose hash moved.** (New interview adds facts to "Career" → only `Career.md` is rewritten.) Untouched notes keep their mtimes and git history. Then `POST /api/series/[id]/vault-ack`.

If Obsidian is closed when the user presses Send, the flag simply waits; the update flows in the next time Obsidian is opened. This is the honest consequence of the local-disk constraint, and it's fine for a memory-bank mirror.

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
- Vault link / push flag: `vault-link` upsert is idempotent; pressing Send stamps `push_requested_at`; `/api/vault/pending` returns the series only while `push_requested_at > last_acked_at`; `vault-ack` clears it; another user's token never sees the link or pending state.

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
3. Server: `series_vault_links` table + migration, `vault-link`/`vault-ack`/`vault/pending` endpoints, and the series-page **Vault card + "Send update to vault" button**.
4. Plugin repo scaffold: settings (token, series pick → `vault-link`, folder, layout, delete-mode), pending check + fetch.
5. Plugin: layout renderers (single + graph), diff engine, ownership guard, archive/mirror, rename handling, ack.
6. Tests (server + plugin), manual vault QA.
