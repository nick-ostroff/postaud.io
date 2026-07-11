# postaud.io — Product Specification (V1)

An AI interviewer that builds knowledge through conversation. The transcript is not the product — the growing knowledge base is. Audio goes in; learning comes out; the learning gets posted to something permanent (memory, blog, book, archive). Hence the name: **post-audio**, and *post* as in publish.

**North star:** every conversation permanently improves what the AI knows about the subject. That knowledge is the compounding asset, not the audio.

> **Note (repo):** this spec supersedes and expands `2026-07-11-knowledge-interviewer-pivot-design.md`. The HTML mockup files referenced in §4 are not yet checked into this repo — links are broken until they're added to the project root.

---

## 1. Core concepts & data model

- **Workspace** — the account container. Has members with roles.
- **User / Member** — a person with a login. Roles: **Admin** (manages workspace, members, all series), **Interviewer** (runs sessions on series they're assigned), **Viewer** (reads stories/transcripts they're given access to).
- **Series** — an ongoing set of interviews about one **subject** (a person, the account owner themself, or an organization). Fields: title, subject, subject relationship, goal (free text — this shapes every question the AI asks), guide settings (see §4), owner, per-member access.
- **Subject** — who the series is about. May be a member (interviewee with own login), or a person with **no account** (interviewed in person via "hand the mic" on the owner's device).
- **Session (interview)** — one voice conversation. Produces: full verbatim transcript, audio, summary, extracted **facts**, and suggested next topics.
- **Fact / Memory** — an atomic extracted knowledge item (e.g. "Met Jan, spring 1975, Hoek van Holland ferry"). Linked to source transcript span + audio timestamp. Facts are correctable; transcripts/audio are immutable.
- **Knowledge base** — all facts for a series, organized as people, places, timeline, topics. Tracks **coverage**: known vs. still blank.
- **Topic queue** — what the AI plans to explore next; seeded by the guide settings, grown by each session, editable by the owner.

## 2. Roles & flows (who does what)

**Account owner / admin (desktop-first):**
1. Signs in (email + password, or Google).
2. Invites members, assigns roles (Members screen).
3. Creates a series via a 4-step wizard: **Basics** (template, title, subject, relationship, goal) → **Assign** (pick owner from members or invite new; grant others can-view / can-interview) → **Guide** (opening prompt, must-cover topics, don't-bring-up list, tone: warm/neutral/playful, session length: 10/20/45 min) → **Review** (AI drafts the first-session question plan; each question editable/removable; then "Create" or "Create & start first interview").
4. Monitors from the series detail page: sessions, topic queue, coverage, staleness ("going stale — interview soon").

**Interviewee (mobile-first, minimal UI):**
1. Gets invited, first-login screen shows who invited them, their role, and which series they get — then accepts.
2. Home screen has one job: a personal prompt ("Sam would love to hear about meeting Dad — the ferry story"), a big **Start talking** button, and a snooze option.
3. Live session: voice-first, one question at a time, full-screen; live faint transcription of their speech; big Pause / Skip question / "I'm done for today" controls.
4. Recap after each session: warm summary ("What we heard today"), list of saved memories, next-time teaser.
5. Review any time: list of all saved memories in their own words (filter: newest/people/places/needs-review). Open one → hear their original audio, then **That's right** / **Fix a detail** (say or type; updates the fact) / **Retell next time** (queues it for the next session). Original recordings are never modified.

**Hand the mic (no-account subjects):** the owner sits with the subject, opens the series on their phone, gets a handoff screen ("Hand the phone to Marta" — questions address her by name, larger text, slower pace; owner can take the phone back to rephrase/skip), and the session records into the same knowledge base under the owner's account.

**Super admin (platform operator, separate console, dark header):**
- Users list: growth stats (users, active series, interviews/week, total facts), per-user network (who invited whom, assignees, subjects), status (active/invited/dormant).
- Account detail: plan, storage, series created, series assigned by others, network panel (incl. account-less subjects), recent activity, impersonate (audited) / email / suspend.
- Series registry: every series cross-account with owner, subject type, sessions, facts, members, last activity.
- Privacy rule: operator sees **metadata only**; transcripts and knowledge bases require an audited impersonation session.

## 3. The interview engine

- Voice-first, one question at a time; feels conversational, not form-filling.
- The AI asks smart follow-ups in real time based on answers; it improvises within the guide rails.
- Guide rails per series: goal, opening prompt, must-cover topic list, don't-bring-up list (AI gently redirects if the subject raises these themselves), tone, target session length.
- Each session ends with: transcript, summary, extracted facts, and proposed future topics (which feed the topic queue).
- Facts extraction builds the knowledge graph: people, places, timeline.

## 4. Screens (all mocked, hi-fi)

HTML mockup files live in this project root. Open a file in a browser to view; each screen has an anchor id — append `#id` to jump straight to it.

**[Postaudio Login.dc.html](../../../Postaudio%20Login.dc.html)** — access:
- 1a Desktop sign-in (email + password, Google)
- 1b Invited member's first login (shows inviter, role, series before accepting)
- 1c Mobile sign-in

**[Postaudio Admin.dc.html](../../../Postaudio%20Admin.dc.html)** — desktop admin & setup:
- 6a Wizard step 1 · Basics (template, title, subject, relationship, goal)
- 6b Wizard step 2 · Assign (owner + per-member access)
- 6c Wizard step 3 · Guide (opening prompt, must-cover, don't-bring-up, tone, length)
- 6d Wizard step 4 · Review & launch (editable first-session question plan)
- 2a Workspace home (all series, coverage, staleness)
- 1d Quick-create series (single screen)
- 2b Series detail (sessions, topic queue — hub of the loop)
- 3a Members & roles (invite, Admin/Interviewer/Viewer)
- 3b Per-series access (owner, can-view / can-interview)

**[Postaudio Mockups.dc.html](../../../Postaudio%20Mockups.dc.html)** — desktop core loop:
- 1a / 1b / 1c Interview screen — 3 direction variants (chat-transcript building live)
- 1e Post-interview results (summary, facts, transcript, next topics)
- 1f Knowledge dashboard (known vs. still blank, people, timeline)
- 1g Export (Markdown / text)

**[Postaudio Mobile.dc.html](../../../Postaudio%20Mobile.dc.html)** — mobile, both roles:
- 1a Owner home
- 1b Hand the mic (no-account subject)
- 1c Interviewee home
- 1d Live session (voice-first, dark)
- 1e Recap ("what we heard today")
- 1f Review list (all saved memories)
- 1g Review detail (that's right / fix a detail / retell)

**[Postaudio Superadmin.dc.html](../../../Postaudio%20Superadmin.dc.html)** — operator console:
- 1a All users (growth, network, status)
- 1b Account detail (plan, series, network, activity, impersonate/suspend)
- 1c Series registry (cross-account)

**[Postaudio Flowchart.dc.html](../../../Postaudio%20Flowchart.dc.html)** — master screen map; lanes for access / admin / core loop / mobile / V2, every node links to its mockup.

**[Postaudio Branding.dc.html](../../../Postaudio%20Branding.dc.html)** — brand directions: 1a Corpus, 1b Heirloom, 1c postaud.io refined.

## 5. Visual system

- Palette: warm paper `#F7F5F0` / `#EFECE6` backgrounds, ink `#211E1A`, muted text `#6E675C`, accent green `oklch(0.52 0.06 165)` (mint `oklch(0.72 0.08 165)` on dark), amber `oklch(~0.5 0.1 50)` for warnings/staleness, white cards with `rgba(33,30,26,0.1)` borders, pill buttons.
- Type: **Newsreader** (serif) for anything the subject said and for headings/titles; **Instrument Sans** for UI. Italic Newsreader = spoken words.
- Live session screens are dark (`#211E1A`) with a radial green glow; everything else is light.
- Tone of copy: warm, plainspoken, never data-sloppy ("64 memories saved for the family", "going stale — interview soon").

## 6. V1 scope

**In:** email/Google auth, workspaces + roles + invites, series wizard with guide rails, voice interview with real-time follow-ups, transcript + summary + fact extraction + next topics per session, knowledge base with coverage dashboard, interviewee review/correct flow, hand-the-mic mode, Markdown/text export, super-admin console.

**Out (V2, on the flowchart as dashed nodes):** SMS/link invites, phone-call recording, scheduling & reminders, automatic topic chasing (AI initiates), multiple participants, knowledge-graph visualization, publishing outputs (blog / book chapters / permanent archive — the "post" in postaud.io; dashboard later gains "enough for a childhood chapter" progress).

## 7. Key invariants

1. Transcripts and audio are immutable; corrections only ever update facts.
2. Every session must add facts — no session leaves the knowledge base unchanged.
3. The interviewee's UI never exceeds one primary action per screen.
4. Don't-bring-up topics are never initiated by the AI.
5. Operator (super admin) access to content is metadata-only unless audited impersonation is active.
