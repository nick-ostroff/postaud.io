# Landing page + auth surface redesign

**Date:** 2026-07-12
**Status:** Approved, ready for planning

## Problem

Two of the three pages a stranger can reach are the weakest pages in the product.

1. **`/` is a placeholder.** A headline, three feature cards, a footer. It's on-brand but it doesn't sell anything, doesn't rank for anything, and doesn't capture anyone.
2. **`/sign-in` is off-brand.** It's leftover generic-SaaS scaffolding — `blue-600` buttons, `neutral-*` grays, `dark:` variants. None of those exist in the warm-paper design system the rest of the app uses. The same is true of `/sign-up`, `/auth/reset`, `/auth/update-password`, and `/auth/verify`.

Meanwhile the repo already contains a login design nobody built: `Postaudio Login.dc.html`.

## Goals

- A full marketing landing page that explains the product, shows it working, captures emails, and is built to rank.
- A sign-in screen built to the existing mockup, on the design system.
- No off-brand page left in the auth flow.

## Non-goals

- **Google OAuth.** The mockup shows it; it requires enabling a Google provider in the Supabase dashboard. Deferred. The design leaves the slot open so it drops in later without a redesign.
- **Pricing.** Not settled, not on the page.
- **Closing `/sign-up`.** Self-serve signup keeps working; it just isn't the landing page's CTA. It stays reachable by direct link and from invite flows.

---

## Design system constraints

Everything below uses the existing warm-paper tokens defined in `src/app/globals.css` — `paper`, `paper-2`, `ink`, `ink-soft`, `muted`, `faint`, `green`, `green-deep`, `green-tint`, `card`, `line`, `line-strong`, `radius-card`, `radius-pill`, `shadow-card`, `shadow-pop` — and the two fonts already loaded in `layout.tsx`: Newsreader (serif — headings and spoken words) and Instrument Sans (UI).

No new colors. No `dark:` variants. The `dark` tokens are reserved for `.dark-session` live-interview surfaces, and the landing page's product-demo section is the one place on these pages allowed to use them.

Shared components in `src/components/ui/`: `Button` (variants `primary` / `secondary` / `ghost`, sizes `md` / `big`), `Card` (bare panel, bring your own padding), `Field` (label + hint wrapper), `Badge`, `Avatar`.

---

## Part 1 — Shared `Input` component

`inputClasses` is currently duplicated verbatim in three files: `src/app/app/series/new/formkit.tsx:14`, `src/app/app/members/InviteForm.tsx:15`, `src/app/welcome/AcceptForm.tsx:9`. The auth pages need a styled input too, and adding a fourth copy is the wrong move.

**Create `src/components/ui/Input.tsx`:**

- Export `inputClasses` (the existing string, unchanged — this is a move, not a restyle).
- Export an `Input` component: `InputHTMLAttributes<HTMLInputElement>` + optional `className` appended.

**Update the three existing call sites** to import from `@/components/ui/Input` and delete their local copies. `textareaClasses` in `formkit.tsx` continues to derive from the imported `inputClasses`.

This is a pure refactor. No visual change to any existing screen. If any existing screen looks different afterward, the refactor is wrong.

---

## Part 2 — Waitlist capture

### Migration — `supabase/migrations/0010_waitlist.sql`

```
public.waitlist
  id          uuid primary key default gen_random_uuid()
  email       citext not null unique
  source      text                        -- 'hero' | 'footer', which form they used
  created_at  timestamptz not null default now()
```

RLS **enabled**, with **no policies for `anon` or `authenticated`**. Nothing reaches this table except the service-role client. The public cannot read the list, and cannot write to it directly — every write goes through the server action below, which is where validation lives.

(`citext` gives case-insensitive uniqueness so `Nick@x.com` and `nick@x.com` are one person. Enable the extension in the migration if it isn't already on.)

### Server action — `src/server/waitlist/actions.ts`

`joinWaitlist(formData: FormData): Promise<WaitlistResult>`

1. Read `email`, `source`, and `website` (the honeypot).
2. If `website` is non-empty, it's a bot. Return success without writing. Bots get told they succeeded.
3. Trim and lowercase the email; validate shape. Invalid → `{ ok: false, error: "That doesn't look like an email address." }`.
4. Insert via `serviceClient()` (`src/db/service.ts`) with `on conflict (email) do nothing`.
5. **Always return `{ ok: true }` on a well-formed email** — whether it was a fresh insert or a duplicate. A duplicate must be indistinguishable from a new signup, or the form becomes an email-enumeration oracle.
6. A genuine database error returns `{ ok: false, error: "Something went wrong. Try again in a moment." }` and is logged server-side.

### Form component — `src/components/waitlist/WaitlistForm.tsx`

A client component. Props: `source: "hero" | "footer"`, optional `className`.

- Single email input + primary submit button, laid out inline on desktop (input flexes, button hugs) and stacked on mobile.
- Hidden honeypot field named `website`, visually hidden (not `display: none` — off-screen, `aria-hidden`, `tabIndex={-1}`).
- States: `idle` → `submitting` (button reads "Joining…", disabled) → `joined` | `error`.
- On `joined`, the form is **replaced in place** by a warm confirmation — no navigation, no toast. Something in the product's voice, e.g. _"You're on the list. We'll be in touch when there's a door to open."_
- On `error`, the message renders under the field and the form stays filled so they can retry.

---

## Part 3 — The landing page (`/`)

Full rewrite of `src/app/page.tsx`. Section components live in `src/app/(marketing)/` — colocated, one file per section, so no single file grows unwieldy.

Voice throughout: warm, literary, a little spare. The serif carries the emotional lines; the sans carries the explanatory ones. This is a product about people's stories — the copy should sound like it was written by someone who cares about that, not by a growth team.

### Sections, in order

**1. Nav.** `post**aud**.io` wordmark (the `aud` in `green-deep`, per the mockup), anchor links to How it works / Why / FAQ, and a `Sign in` button. Sticky is fine; it must not be heavy.

**2. Hero.** The giant ghosted `”` from the login mockup as a background mark (serif, italic, ~340px, `rgba(33,30,26,0.045)`, `pointer-events: none`, `user-select: none`, and hidden from screen readers). A serif headline, a sans subhead, and — critically — **the waitlist form inline in the hero**, not a button that scrolls somewhere. Below it, the atmospheric spoken line in italic serif: `»Tell me about the ferry.«`

**3. The stakes.** One short, quiet section. The reason the product exists: the knowledge leaves with the person, and it leaves faster than anyone expects. Two or three sentences, large serif, lots of air. No cards, no icons. This section's job is to make someone feel something for four seconds.

**4. How it works.** Three steps, numbered: start a series → Anna interviews, one question at a time, following up on what matters → the knowledge base compounds, session over session. Each step gets a sentence, not a paragraph.

**5. The product moment — the centerpiece.** A rendered sample exchange shown on the `.dark-session` surface (the same visual language as a real live interview, so this section doubles as a screenshot of the product):

- Anna asks a question.
- The subject answers — a real, human, slightly meandering answer.
- Anna follows up on the *specific detail* that mattered in that answer. This is the beat that proves it isn't a form.

Beside it (below it, on mobile): the **fact cards that conversation produced** — a person, a place, a date — rendered as the actual knowledge-base cards. The visual argument is: _talking produced structured knowledge, and you didn't do anything._

This is the section that sells the product. It gets the most design attention.

**6. Three benefits.** Voice-first interviews / a knowledge base that compounds / export as Markdown, no lock-in. These are the three cards from the current page — same ideas, properly designed, on `Card`.

**7. Who it's for.** Three short use cases: a family recording a parent's history; a founder capturing what only they know; an expert handing off a craft before they retire. Short — this section exists to let a visitor self-identify, not to be read.

**8. FAQ.** Five questions as native `<details>`/`<summary>` accordions — no JavaScript, works without hydration, and is crawlable. Suggested set: What is PostAud.io? / Do I need to install anything? / Who can see my family's memories? / What happens to my data if I leave? / How long is a session? Final copy to be written during implementation.

**9. Closing CTA.** The waitlist form again (`source="footer"`), with a single line of serif above it.

**10. Footer.** A real footer — wordmark, a short product blurb, link columns (product / company / legal, with only the links that actually exist — no dead links), copyright. Not a bare copyright line.

### SEO

- A `metadata` export on the page: title, description, `alternates.canonical`, `openGraph` (title, description, url, siteName, type: website), and `twitter` (`summary_large_image`).
- **JSON-LD**, injected as a `<script type="application/ld+json">`:
  - `FAQPage`, mirroring the FAQ section exactly. The FAQ copy and the JSON-LD must be generated from **one shared array** in the source — two hand-maintained copies will drift, and Google penalizes JSON-LD that doesn't match visible content.
  - `SoftwareApplication` for the product itself.
- Exactly one `<h1>` on the page (the hero headline). Sections use `<h2>`.
- All decorative marks (the giant `”`) are `aria-hidden`.

### Accessibility

Every interactive element reachable by keyboard, with a visible focus ring (the existing `focus:outline-green` treatment). Body text meets contrast against `paper` — `faint` (`#9A9285`) is for decoration and non-essential meta only, never for anything a user must read.

---

## Part 4 — The sign-in screen (`/sign-in`)

Rebuilt to `Postaudio Login.dc.html` §1a. Rewrites both `src/app/sign-in/page.tsx` and `src/app/sign-in/SignInForm.tsx`.

**Layout (`page.tsx`):** A centered stage on `paper`, with the giant ghosted `”` bleeding off the top-left. Inside, a `Card` (~400px, `36px 38px 32px` padding) containing:

- The `post**aud**.io` wordmark.
- `Welcome back` — serif, 27px.
- `Sign in to keep the stories going.` — sans, `muted`.
- The form.
- Below the card, the stage foot: _"New here? Someone in your family usually opens the door."_
- Pinned near the bottom of the stage, the atmospheric line: `»Tell me about the ferry.«` — italic serif, `faint`.

**Form (`SignInForm.tsx`):** Keeps the existing behavior — Supabase `signInWithPassword`, and the magic-link (`signInWithOtp`) alternative — and drops all the blue/neutral/dark styling.

- Email + password on `Field` + the shared `Input`.
- A full-width `Button variant="primary"` — `Sign in`.
- An `or` divider (the `::before`/`::after` rule pattern from the mockup).
- **Where the mockup puts "Continue with Google," we put a full-width `Button variant="secondary"` reading "Email me a link instead."** This is the existing magic-link flow. It occupies the exact slot Google will eventually take, so adding Google later means adding a button next to this one — not redesigning the screen.
- `Forgot password?` → `/auth/reset`.
- The magic-link "check your inbox" success state is restyled onto `green-tint` / `green-deep` instead of `emerald-*`.
- Errors render in `amber` (the design system's warning color), not `rose-*`.

The `?error=` search-param banner that `page.tsx` renders today is kept — the auth callback route depends on it — restyled to `amber-tint`.

---

## Part 5 — The rest of the auth surface

Same treatment, mechanical, no behavior changes. These pages exist and are all in the same off-brand blue; leaving them means "Forgot password?" drops a user off a cliff.

- `src/app/sign-up/page.tsx` + `SignUpForm.tsx`
- `src/app/auth/reset/page.tsx`
- `src/app/auth/update-password/page.tsx`
- `src/app/auth/verify/page.tsx`

For each: swap `neutral-*` → `ink` / `muted` / `faint` / `line`, `blue-600` → `Button variant="primary"`, `rose-*` → `amber`, `emerald-*` → `green`, raw inputs → `Field` + `Input`, and remove every `dark:` variant. Wrap each in the same centered warm-paper stage as sign-in so the whole flow feels like one place.

**Explicitly not changing:** any auth logic, redirect, route handler, or Supabase call on these pages. Styling only. If a test covering auth behavior breaks, the change was wrong.

---

## Verification

- `npm run build` and `npm run lint` clean.
- Existing test suite passes — in particular anything covering auth, since Part 5 touches auth pages and must not change their behavior.
- **Manual, in a browser:** submit the waitlist form and confirm the row lands in `public.waitlist`; submit the *same email again* and confirm the user sees the identical success state; sign in with a password; sign in with a magic link; walk the forgot-password → reset → update-password flow end to end.
- Confirm no `blue-*`, `neutral-*`, `emerald-*`, `rose-*`, or `dark:` class remains under `src/app/sign-in`, `src/app/sign-up`, `src/app/auth`, or `src/app/page.tsx` (grep it).
- The landing page's rendered FAQ text matches its `FAQPage` JSON-LD exactly.

## Open questions

None. Google OAuth, pricing, and closing `/sign-up` are all deliberately out of scope and recorded as non-goals above.
