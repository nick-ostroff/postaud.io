# /super Operator Console Redesign — Implementation Plan

**Goal:** Re-architect the `/super` operator console to match the revised Postaudio Superadmin mockup: a left dark sidebar (Dashboard · Users · Series · Usage), a Dashboard landing (KPI tiles + 12-week growth spark chart + master-detail user list with a slide-in detail panel), richer tables, real data only.

**Branch/worktree:** feat/super-redesign in /Users/nickostroff/claude-global/claude-projects/99-apps/postaud-io-super2 (off main).

## Global Constraints

- **Design tokens already exist** in `src/app/globals.css` — USE THEM, do not hardcode hex where a token exists: `--paper #F7F5F0`, `--paper-2 #EFECE6`, `--green oklch(0.52 0.06 165)`, `--green-deep oklch(0.40 0.06 165)`, `--mint oklch(0.72 0.08 165)`, `--amber oklch(0.50 0.10 50)`, `--serif "Newsreader"`. Tailwind exposes `bg-paper`, `text-green-deep`, `bg-green-tint`, `font-serif`, etc. (see `@theme` block in globals.css). Operator sidebar dark = `#211E1A`, sidebar text `#F0EDE6`, muted `rgba(240,237,230,0.6)`. Ink scale from mockup: body `#3A362F`, muted `#6E675C`, faint `#9B9488`.
- **Numbers/headings use `font-serif` (Newsreader).** Body copy uses the default (Instrument Sans).
- **Metadata only:** never select/render `facts.statement`, `interview_messages.text`, `interview_summaries.*`, or topic content. Counts, titles, names, emails, dates, statuses only.
- **Real data only** (user decision): every panel maps to a real query. Omit billing price and anything not tracked. No fake/placeholder cells.
- **Auth unchanged:** `/super` admin gate lives in `src/proxy.ts` + `src/app/super/layout.tsx` (`isPlatformAdmin()` → `notFound()`). Pages must NOT add their own auth check. Impersonation (`/api/super/impersonate` + exit, the banner, the sidebar app-link) MUST keep working untouched.
- Full-width standard: no page-level `max-w-*` boxing; tables stretch edge-to-edge.
- **Responsive (both mockups provided — desktop "Postaudio Superadmin.dc.html" + "Postaudio Superadmin Mobile.dc.html"):** the console must work on phones. Breakpoint at Tailwind `lg` (1024px).
  - **Desktop (≥lg):** left dark sidebar `230px` + paper content (as specced per task).
  - **Mobile (<lg):** NO left sidebar. Instead: a compact dark (`#1B1814`) top header — logo + `SUPER` badge + a ☰ **"Sections"** button (right) — and a fixed **bottom tab bar** (Dashboard · Users · Series · Usage, 4 tabs, active tab green). Content sits on a warm-paper sheet with `rounded-t-[20px]` under the dark header. Tapping ☰ opens a **Sections overlay menu** (dark panel, dims the screen) listing the same destinations + operator identity + Sign out.
  - **Tables → cards on mobile:** the Users list and Series registry render as a stack of white rounded cards (avatar + name + one-line meta + status pill) below `lg`, and as the full table at `lg+`. The Dashboard's master-detail right-panel is **desktop-only**; below `lg` a user row/card just links to `/super/users/[id]` (no side panel — screen too narrow).
  - Mobile bottom-bar labels: Dashboard tab may read **"Pulse"** to match the mockup; keep route `/super`.
  - The mockup HTML for both is the fidelity reference — match its spacing, radii (cards 12–14px, sheet 20px), and the token palette.
- Commands: `npm run lint`, `npm test`, `rm -rf .next && npm run build`. No `sed` — use Edit/Write.
- **COMMIT WITH A MESSAGE FILE** (`git commit -F <file>`), never inline `-m` (apostrophes have killed commits in this repo).

## Routing change (important)

Today `/super` IS the users list. New IA:
- `/super` → **Dashboard** (new).
- `/super/users` → users list (the current `/super/page.tsx`, moved + enriched).
- `/super/users/[id]` → user detail (restyled).
- `/super/series` → series registry (restyled).
- `/super/usage` → usage summary (new).
- `/super/accounts` + `/super/accounts/[id]` → keep working (reachable, off-nav). Leave as-is.

---

### Task R1: Data layer — growth, per-user network + facts, dormant count

**Files:** Modify `src/db/queries/admin.ts`; Test `src/db/__tests__/platform-growth.test.ts`, and extend `src/db/__tests__/platform-users.test.ts`.

**Produces:**
```ts
export type GrowthBucket = { weekStart: string; count: number }; // ISO date (Monday), signups that week
export type PlatformGrowth = {
  weekly: GrowthBucket[];      // exactly 12 buckets, oldest→newest, contiguous weeks ending this week
  totalUsers: number;
  newThisWeek: number;
  dormantCount: number;        // users whose most-recent interview (any org they belong to) is >30d ago, or who never had one
};
export async function getPlatformGrowth(): Promise<PlatformGrowth>;
```
And extend `PlatformUserRow` with:
```ts
  factsCount: number;                                   // facts across series this user created
  network: { invited: number; assignees: number; subjects: number };
```
Network definitions (keep real + cheap, all from data already loaded in `listPlatformUsers`):
- `invited`: other members (user_id ≠ this user) in any org where this user is the earliest-admin (owner). If not an owner of any org, 0.
- `subjects`: distinct `series.subject_user_id` (≠ this user, non-null) across series this user created (`created_by = user`).
- `assignees`: distinct `series_access.user_id` (≠ this user) granted on series this user created.

**Steps (TDD):**
1. Write failing tests:
   - `getPlatformGrowth`: given users with created_at across several weeks, returns exactly 12 contiguous weekly buckets oldest→newest, correct counts, correct `newThisWeek`, `totalUsers`; `dormantCount` counts a user with a >30d-old last interview and a user with none, and does NOT count a user with a recent interview. Mock `@/db/service` with the hoisted-vi pattern used in the existing tests (fluent chain returning canned rows; the mock must honor the calls the impl makes — assert filter args where a wrong column would change results, per the repo convention).
   - `listPlatformUsers` (extend): a user who owns an org with 2 other members → `network.invited === 2`; a user who created a series whose subject_user_id is someone else → `network.subjects === 1`; a series_access grant to another user on their series → `network.assignees === 1`; `factsCount` sums facts across their created series only.
2. Run → fail.
3. Implement. For growth, bucket by ISO week Monday. Compute week starts deterministically from the newest user's created_at or "now"? Tests can't use Date.now() in queries directly — the query MAY use `new Date()` (it runs server-side, not in a workflow); tests inject rows relative to a fixed reference and assert bucket COUNTS and ordering rather than absolute dates where feasible. Keep the 12-week window anchored on the current week (server `new Date()` is fine here — this is app code, not a workflow script).
4. Run → pass. `npm run lint`. Commit (message file).

---

### Task R2: Sidebar shell

**Files:** Rewrite `src/app/super/SuperShell.tsx`; replace `src/app/super/OpNav.tsx` → `src/app/super/SuperNav.tsx` (client, sidebar nav); modify `src/app/super/layout.tsx` to pass the operator's email.

**Design (from mockup):** grid `230px 1fr`. Left column dark `#211E1A`, full height, padding 20px 16px, flex column:
- Logo row: postaud.io wordmark (reuse existing bars-glyph markup from mockup: a 26px rounded-7px green square with 4 vertical bars) + wordmark `postaud` white + `.io` in `text-[oklch(0.72_0.08_165)]`. Font `font-serif`? No — mockup uses Instrument Sans 600 15.5px for the wordmark. Keep sans, weight 600.
- `SUPER ADMIN` badge: mono 10px, `bg-green`, white, letter-spacing 0.06em, self-start, margin 14px 0 18px.
- Nav items (SuperNav, client): Dashboard `/super`, Users `/super/users`, Series `/super/series`, Usage `/super/usage`. Each: flex, gap-9px, padding 9px 12px, rounded-8px, 13px. Active: `bg-[oklch(0.52_0.06_165/0.28)] text-white font-semibold` with a 5px mint dot; inactive: `text-[rgba(240,237,230,0.6)]` with a transparent dot, hover→white. Active match: Dashboard exact `=== "/super"`; others `startsWith`.
- Spacer (`mt-auto`), then operator identity: 28px round avatar (mint-tint bg, initial), name "Operator", email (the prop) truncated.
- A small "← Back to app" link under identity (keep the escape hatch that exists today), muted.

Main column: `bg-paper`, `min-h-screen`, content padded (e.g. `px-7 py-6`). Render `{children}`.

Layout passes email: in `src/app/super/layout.tsx`, after the admin check, get the user via `createClient()` `auth.getUser()` and pass `operatorEmail={user?.email ?? ""}` to `SuperShell`.

**Mobile chrome (<lg), same SuperShell:** hide the sidebar (`hidden lg:flex`). Render instead:
- A compact dark `#1B1814` top header (`lg:hidden`): logo + `SUPER` badge + a ☰ **"Sections"** pill button on the right (client — toggles the overlay).
- The paper content wrapped so it reads as a `rounded-t-[20px]` sheet under that header.
- A fixed **bottom tab bar** (`lg:hidden`, `fixed bottom-0`): Dashboard(/super, label "Pulse") · Users(/super/users) · Series(/super/series) · Usage(/super/usage); active tab green, via the same client nav component (`usePathname`). Add bottom padding to content so the bar doesn't cover it.
- A **Sections overlay** (client state in SuperNav or a small `SuperMobileNav` client component): when ☰ is tapped, a dark panel drops over the screen with the four destinations + operator identity + a Sign out link (POST `/auth/sign-out`, the existing route). Tapping a destination or ✕ closes it.
Keep all of this in `SuperNav`/`SuperShell` (client where interactivity is needed). The `← Back to app` escape hatch stays reachable (in the Sections menu on mobile, under identity on desktop).

**Steps:** implement; no unit test (visual shell). Gate: `npm run lint`, `npm test` (still green), `npm run build`. Verify sidebar (desktop) AND the mobile header+bottom-bar+Sections-menu render, on every /super route. Commit (message file).

---

### Task R3: Dashboard at /super (KPI + growth chart + master-detail)

**Files:** Create `src/app/super/page.tsx` (Dashboard, replaces the current users-list page — that content moves to Task R4 first, so do R4's move BEFORE this? No: to avoid a broken intermediate, this task CREATES the new dashboard at /super after R4 has moved the old list to /super/users. Sequence R4 before R3 is cleaner, but the plan numbers R3 before R4 — so in R3, first move the existing `/super/page.tsx` to `/super/users/page.tsx` via `git mv` if not already done, then write the new dashboard.) Create `src/app/super/DashboardUsers.tsx` (client, the master-detail list+panel); Create `src/app/api/super/users/[id]/route.ts` (admin-gated GET returning `getPlatformUserDetail` JSON for the panel).

**Server page (`/super/page.tsx`):** fetch `getPlatformStats()`, `getPlatformGrowth()`, and `listPlatformUsers({ limit: 50 })`. Render:
- KPI tile row (5 tiles, white cards, border, radius-12, Newsreader numbers): Users (`totalUsers`, subtitle `+{newThisWeek} this week` in green), Active series, Interviews this week, Facts captured, Dormant>30d (`dormantCount`, amber number, subtitle `{pct}% of users`).
- Growth card: label "Users · 12 weeks", the total in Newsreader, and a spark-bar row — 12 bars, height ∝ bucket.count / max, `bg-green` with ascending opacity, radius top. Pure CSS, no chart lib. Caption `+{newThisWeek} this week`.
- `<DashboardUsers rows={rows} />`.

**`DashboardUsers.tsx` (client):** two-column flex; left = the users table (columns: User, Network, Series, Last active, Status), rows clickable; right = a 400px detail panel that renders only when a row is selected (else the left table takes full width). On select, `fetch(/api/super/users/${id})` → render panel: header (avatar, name, email, ✕ to close), stat tiles (Series, Facts, Plan? omit plan — real-data-only → show Series/Facts/Sessions), Network list, Top series (titles + fact counts), Recent activity (audit actions), and action buttons: **Full profile** (`Link` to `/super/users/${id}`), **Impersonate** (reuse `src/components/super/ImpersonateButton.tsx`), **Email** (`mailto:`). Selected row gets a green left-border + tint. Panel slides in (CSS transition on width/opacity). Loading state while fetching.

**Route `/api/super/users/[id]/route.ts`:** admin-gate via `platformAdminEmail()` → 404 if not admin; return `getPlatformUserDetail(id)` as JSON, 404 if null.

**Mobile (<lg):** the master-detail split is desktop-only. Below `lg`, `DashboardUsers` renders the KPI/growth section stacked, then the users as **cards** (avatar + name + `invited N · X series · Y facts` one-liner + status pill) that link straight to `/super/users/${id}` (no slide-in panel). Use `hidden lg:block` / `lg:hidden` to switch between the panel-table and the card list.

**Steps:** implement; gate lint/test/build. Add one test for the new API route (admin → 200 with detail shape; non-admin → 404) mirroring the impersonate route test's admin-mock pattern. Commit (message file).

---

### Task R4: Users list page (/super/users) + user detail restyle

**Files:** `src/app/super/users/page.tsx` (the moved+enriched list); `src/app/super/users/[id]/page.tsx` (restyle).

**Users list:** full-width white card table in the new paper shell. Header "Users", subtitle. Search input (existing `q` param logic). Columns: User (avatar+name+email), Joined (`created_at` "Mon YYYY"), Network (`invited N · assignees N · subjects N`, dashes where 0), Series (`{owned} owned`), Facts (`factsCount`, mono), Last active (relativeTime), Status (badge Active/Dormant/Invited using existing status logic — reuse the activity-status derivation already used; if PlatformUserRow lacks a status, derive Active/Dormant from lastActivity>30d and Invited from an unaccepted-only membership). Row → `/super/users/[id]`. Keep pagination. Impersonate action stays on the row (existing button) OR only in detail — keep it on the row for parity with current behavior.

**Mobile (<lg) for both list + registry:** render the table as a stack of white rounded cards (`lg:hidden`), table as `hidden lg:block`. User card: avatar + name + `invited N · X series · Y facts` + status pill, links to detail. Keep the KPI mini-tiles (New/wk, Interviews, Facts) above the list on mobile per the mockup.

**User detail restyle:** match mockup 1b — left column: identity card (52px avatar, name, email, meta rows Joined/Last active/Status/Storage[best-effort or omit]/Facts) with Impersonate + Email actions and a muted "Suspend account…" affordance (non-functional, existing pattern — keep disabled). Network card. Right column: "Series created (N)" table (Series/Subject/Sessions/Facts/Last activity), and the existing audit "Recent activity" list. All warm-paper, white cards, radius-14, Newsreader numbers. Keep the existing data from `getPlatformUserDetail` (extend only if a shown field is missing — e.g. it already has seriesOwned/seriesSubjectOf/orgs/counts/auditLog).

**Steps:** implement; gate lint/test/build. Commit (message file).

---

### Task R5: Series registry restyle + Usage page

**Files:** `src/app/super/series/page.tsx` (restyle); Create `src/app/super/usage/page.tsx`.

**Series registry:** restyle current `listSeriesRegistry` table into the new shell — white card, `sa-th`/`sa-tr` grid look, Newsreader for counts, status/stale badges in the token palette. Keep existing columns (Series, Org, Subject, Sessions, Facts, Members, Last activity, stale). Search stays.

**Usage page (real data only):** a simple platform-usage summary from existing stats — reuse `getPlatformStats()` + `getPlatformGrowth()`: KPI tiles (total facts, interviews this week, active series, dormant), the growth chart again or a facts-oriented tile, and a "Top users by facts" list (sort `listPlatformUsers` by `factsCount` desc, top 10, linking to detail). No billing. Header "Usage". If a genuinely real per-time series isn't cheap, keep it to totals + top-users — do not invent numbers.

**Steps:** implement; gate lint/test/build. Commit (message file).

---

### Task R6: Verify + review

- `rm -rf .next && npm run build`; `npm test` all green; `npm run lint`.
- Drive a live check (dev server + real Supabase, temporarily setting PLATFORM_ADMIN_EMAILS to nick@ostroff.la as the prior E2E did, restoring after): `/super` renders the Dashboard with KPIs + chart + list; clicking a user opens the panel with real data; **Full profile** → `/super/users/[id]`; nav items route correctly and highlight; `/super/series` and `/super/usage` render; **impersonation still works end-to-end** (start → banner → exit) and the sidebar app-link is unaffected.
- Final whole-branch review.
