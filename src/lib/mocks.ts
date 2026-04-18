/**
 * Mock data for UI-flow development. Replace with real Supabase queries
 * when wiring the backend. See plan/07–14 for real data model.
 */

export type MockOrg = {
  id: string;
  name: string;
  plan: "free" | "starter" | "growth" | "scale";
  credits_remaining: number;
  credits_total: number;
};

export type MockUser = {
  id: string;
  display_name: string;
  email: string;
};

export type MockContact = {
  id: string;
  first_name: string;
  last_name: string;
  phone_e164: string;
  email?: string;
};

export type MockQuestion = {
  id: string;
  position: number;
  prompt: string;
  hint?: string;
  allow_followup: boolean;
  max_seconds: number;
  required: boolean;
};

export type OutputType =
  | "transcript.plain"
  | "summary.concise"
  | "qa.structured"
  | "blog.draft"
  | "crm.note"
  | "webhook.json";

export type MockTemplate = {
  id: string;
  name: string;
  intro_message: string;
  sms_body: string;
  output_type: OutputType;
  webhook_url?: string;
  questions: MockQuestion[];
  is_active: boolean;
  updated_at: string;
};

export type SendStatus =
  | "sent"
  | "reminded"
  | "completed"
  | "partial"
  | "failed"
  | "declined"
  | "expired"
  | "cancelled";

export type MockSend = {
  id: string;
  contact: MockContact;
  template_name: string;
  status: SendStatus;
  sent_at: string;
  completed_at?: string;
  duration_sec?: number;
  dial_code: string;
};

export const mockOrg: MockOrg = {
  id: "org_1",
  name: "Pixelocity",
  plan: "growth",
  credits_remaining: 73,
  credits_total: 100,
};

export const mockUser: MockUser = {
  id: "u_1",
  display_name: "Nick Ostroff",
  email: "nick@pixelocity.com",
};

export const mockContacts: MockContact[] = [
  { id: "c_1", first_name: "Sarah", last_name: "Chen", phone_e164: "+15551234567", email: "sarah@acme.co" },
  { id: "c_2", first_name: "Marcus", last_name: "Patel", phone_e164: "+15559871234" },
  { id: "c_3", first_name: "Ava", last_name: "Nguyen", phone_e164: "+15557654321", email: "ava@example.com" },
  { id: "c_4", first_name: "Derek", last_name: "O'Brien", phone_e164: "+15553216547" },
  { id: "c_5", first_name: "Priya", last_name: "Ramesh", phone_e164: "+15554449999", email: "priya@startup.io" },
];

export const mockTemplates: MockTemplate[] = [
  {
    id: "t_1",
    name: "Client intake — pre-appointment",
    intro_message: "A quick prep call before our meeting.",
    sms_body:
      "Hi {first_name}, Nick here — tap to answer a quick 3-min prep call before our meeting: {link}",
    output_type: "crm.note",
    webhook_url: "https://hooks.zapier.com/abc/xyz",
    is_active: true,
    updated_at: "2026-04-16T14:30:00Z",
    questions: [
      { id: "q1", position: 0, prompt: "What's the main thing you hope to get out of our call?", allow_followup: true, max_seconds: 90, required: true },
      { id: "q2", position: 1, prompt: "How are you handling this problem today?", allow_followup: true, max_seconds: 90, required: true },
      { id: "q3", position: 2, prompt: "Is there a specific timeline you're working against?", allow_followup: false, max_seconds: 45, required: false },
    ],
  },
  {
    id: "t_2",
    name: "Coach Spotlight (blog draft)",
    intro_message: "5 quick questions for the Rally Leagues blog.",
    sms_body:
      "Hi {first_name} — quick voice interview for the Rally Leagues blog, 5 mins: {link}",
    output_type: "blog.draft",
    is_active: true,
    updated_at: "2026-04-12T09:15:00Z",
    questions: [
      { id: "q1", position: 0, prompt: "How did you get into pickleball coaching?", allow_followup: true, max_seconds: 120, required: true },
      { id: "q2", position: 1, prompt: "What's the single biggest mistake new players make?", hint: "Stories welcome", allow_followup: true, max_seconds: 120, required: true },
      { id: "q3", position: 2, prompt: "Walk me through your favorite drill for doubles.", allow_followup: true, max_seconds: 180, required: true },
      { id: "q4", position: 3, prompt: "What does a typical week of training look like for a student you coach?", allow_followup: false, max_seconds: 120, required: false },
      { id: "q5", position: 4, prompt: "Anything else you want Rally Leagues readers to know?", allow_followup: false, max_seconds: 90, required: false },
    ],
  },
  {
    id: "t_3",
    name: "Customer feedback — product V2",
    intro_message: "Three quick questions. Your answers ship with the next release.",
    sms_body: "Hi {first_name}, quick 2-min voice feedback for the team: {link}",
    output_type: "qa.structured",
    is_active: true,
    updated_at: "2026-04-10T18:45:00Z",
    questions: [
      { id: "q1", position: 0, prompt: "What's working well for you?", allow_followup: true, max_seconds: 60, required: true },
      { id: "q2", position: 1, prompt: "What's missing or frustrating?", allow_followup: true, max_seconds: 90, required: true },
      { id: "q3", position: 2, prompt: "Who else do you wish used this?", allow_followup: false, max_seconds: 45, required: false },
    ],
  },
  {
    id: "t_4",
    name: "Interview yourself",
    intro_message: "Dump a voice memo and get a blog draft back.",
    sms_body: "Self-interview ready: {link}",
    output_type: "blog.draft",
    is_active: false,
    updated_at: "2026-04-02T11:00:00Z",
    questions: [
      { id: "q1", position: 0, prompt: "What's the single idea you want to get across?", allow_followup: true, max_seconds: 120, required: true },
      { id: "q2", position: 1, prompt: "Who is this for, and what problem does it solve for them?", allow_followup: true, max_seconds: 120, required: true },
      { id: "q3", position: 2, prompt: "What's the most surprising thing you've learned about it?", allow_followup: true, max_seconds: 120, required: false },
    ],
  },
];

export const mockSends: MockSend[] = [
  { id: "s_1", contact: mockContacts[0], template_name: "Client intake — pre-appointment", status: "completed", sent_at: "2026-04-17T16:20:00Z", completed_at: "2026-04-17T17:05:00Z", duration_sec: 214, dial_code: "483926" },
  { id: "s_2", contact: mockContacts[1], template_name: "Coach Spotlight (blog draft)",     status: "completed", sent_at: "2026-04-17T14:00:00Z", completed_at: "2026-04-17T15:12:00Z", duration_sec: 412, dial_code: "271048" },
  { id: "s_3", contact: mockContacts[2], template_name: "Coach Spotlight (blog draft)",     status: "sent",      sent_at: "2026-04-18T10:30:00Z", dial_code: "558317" },
  { id: "s_4", contact: mockContacts[3], template_name: "Customer feedback — product V2",   status: "partial",   sent_at: "2026-04-16T09:00:00Z", completed_at: "2026-04-16T09:14:00Z", duration_sec: 87,  dial_code: "124905" },
  { id: "s_5", contact: mockContacts[4], template_name: "Client intake — pre-appointment",  status: "reminded",  sent_at: "2026-04-15T12:00:00Z", dial_code: "662219" },
  { id: "s_6", contact: mockContacts[1], template_name: "Customer feedback — product V2",   status: "expired",   sent_at: "2026-04-08T18:00:00Z", dial_code: "300481" },
  { id: "s_7", contact: mockContacts[0], template_name: "Coach Spotlight (blog draft)",     status: "declined",  sent_at: "2026-04-14T11:30:00Z", completed_at: "2026-04-14T11:31:00Z", duration_sec: 12,  dial_code: "889021" },
];

export const mockSessionDetail = {
  send: mockSends[1], // Marcus Patel — Coach Spotlight — completed
  transcript:
    "Thanks so much for taking the call. I started coaching about nine years ago, mostly because I kept getting pulled aside at open-play nights by folks asking how I was getting my third shots so tight. What really gets me is the footwork piece — most new players think pickleball is about the paddle, but it's a game of feet. If I had to pick one drill, it's ladder-to-net: you ladder once, split-step, pop three dinks with a partner, reset, and repeat. Simple, and you'll see crossover gains inside a week. On schedule — I push students to train three days, with one being live play and one being pure mechanics.",
  answers: [
    { question: "How did you get into pickleball coaching?", answer: "Started about nine years ago after getting pulled aside at open-play nights by people asking about his third-shot technique.", confidence: 0.94 },
    { question: "What's the single biggest mistake new players make?", answer: "Focusing on the paddle instead of footwork. Players treat it as a hand sport; it's really a feet sport.", confidence: 0.91, followup: "Can you give an example of what bad footwork looks like?" },
    { question: "Walk me through your favorite drill for doubles.", answer: "Ladder-to-net drill: ladder footwork once, split-step at the kitchen, pop three dinks with a partner, reset, repeat. Crossover gains within a week.", confidence: 0.96 },
    { question: "What does a typical week of training look like for a student you coach?", answer: "Three sessions per week. One live-play, one mechanics-only, and one mixed.", confidence: 0.88 },
    { question: "Anything else you want Rally Leagues readers to know?", answer: "", confidence: 0.2 },
  ],
  summary: {
    short:
      "Marcus Patel shared how footwork — not paddle mechanics — is the single biggest gap in most new pickleball players, and walked through his signature ladder-to-net drill.",
    long:
      "Marcus has coached pickleball for nine years. He sees most new players treat it as a paddle sport when it's actually a footwork sport — his preferred drill (ladder-to-net into a split-step and three paced dinks) builds the crossover movement patterns that drive fast improvement. He trains students three days a week split between live play, pure mechanics, and mixed.",
    bullets: [
      "Nine years coaching; started after being asked about third-shot technique",
      "Footwork > paddle technique as the biggest hidden fundamental",
      "Ladder-to-net drill is his signature for doubles students",
      "Three-days-a-week training cadence (live, mechanics, mixed)",
      "Gains usually visible in a week of consistent drilling",
    ],
  },
  output: {
    type: "blog.draft" as OutputType,
    rendered_text: `# The Single Thing Most New Pickleball Players Get Wrong — And the Drill That Fixes It

Marcus Patel has been coaching pickleball for nine years, and if you ask him what's missing in the average new player's game, he won't mention the paddle.

"Most new players think pickleball is about the paddle," he told us. "But it's a game of feet."

## Start with footwork, not swing mechanics

Marcus's story starts at open-play nights, where he kept getting pulled aside by players asking how he was getting his third-shot drops so tight. The common thread in every answer: footwork. Players who treat pickleball as a hand sport plateau quickly. Players who treat it as a feet sport keep climbing.

## The ladder-to-net drill

His favorite drill for doubles students is dead simple:

1. Run a single ladder at the baseline
2. Advance to the kitchen and split-step
3. Pop three paced dinks with a partner
4. Reset to the baseline and repeat

"Simple, and you'll see crossover gains inside a week."

## A weekly cadence for real progress

Marcus has his students train three days a week — one session is live play, one is pure mechanics, and one blends both. That split, he says, is what separates players who plateau from players who keep leveling up.

---

*Marcus Patel coaches in [TODO: location] and contributes to the Rally Leagues blog.*`,
    status: "succeeded" as const,
  },
  webhook_deliveries: [
    { id: "d_1", url: "https://hooks.zapier.com/abc/xyz", status: "succeeded" as const, response_status: 200, attempted_at: "2026-04-17T15:13:12Z" },
  ],
};

export const DEMO_TOKEN = "demo";
export const DEMO_SEND = {
  firstName: "Sarah",
  senderName: "Nick at Pixelocity",
  templateTitle: "Client intake — pre-appointment",
  estMinutes: 3,
  pooledNumber: "+18885551234",
  dialCode: "483926",
};
