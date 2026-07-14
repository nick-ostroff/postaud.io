import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <main className="flex w-full flex-col items-center bg-paper px-6 py-16">
      {/* TODO: reviewed by Nick — plain-language draft, not legal advice. */}
      <div className="w-full max-w-2xl">
        <Link href="/" aria-label="PostAud.io home">
          <Wordmark className="text-xl" />
        </Link>

        <h1 className="serif mt-8 text-[32px] text-ink">Privacy Policy</h1>
        <p className="mt-2 text-[13px] text-muted">Last updated July 2026.</p>

        <div className="mt-8 space-y-7 text-[14.5px] leading-[1.7] text-ink-soft">
          <p>
            PostAud.io is an AI interviewer: you talk, it asks questions, and it builds a
            knowledge base from what you say. This page explains, in plain language, what we
            collect and why.
          </p>

          <section>
            <h2 className="serif text-[19px] text-ink">What we collect</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <strong className="text-ink">Waitlist signups.</strong> If you request an invite
                from the homepage, we store the email address you submit so we can contact you
                when a spot opens up.
              </li>
              <li>
                <strong className="text-ink">Account details.</strong> When you create an
                account, we store your email address and password (handled by our
                authentication provider, Supabase — we never see your password in plain text).
              </li>
              <li>
                <strong className="text-ink">Interview audio and transcripts.</strong> When you
                run an interview, we record the audio, transcribe it, and extract facts, people,
                places, and dates into your knowledge base. The audio is stored so it can be
                played back alongside the facts it produced.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="serif text-[19px] text-ink">How interviews are processed</h2>
            <p className="mt-3">
              Interviews are conducted by a voice AI from OpenAI (their realtime voice model
              conducts the conversation) and the resulting transcript is analyzed by Anthropic&rsquo;s
              AI to extract facts, people, places, and timeline entries into your knowledge base.
              Your interview audio and transcript are sent to these providers to make the product
              work — that&rsquo;s the extent of it.
            </p>
          </section>

          <section>
            <h2 className="serif text-[19px] text-ink">Who can see what</h2>
            <p className="mt-3">
              Series are private to your workspace. Access to a given series is granted per
              person you invite — someone invited to one series cannot see another. We don&rsquo;t sell
              or share your data with advertisers.
            </p>
          </section>

          <section>
            <h2 className="serif text-[19px] text-ink">Your data, your export</h2>
            <p className="mt-3">
              You can export everything in a series — summaries, facts, people, places, and
              transcripts — as a Markdown file at any time, directly from the app. No request
              queue, no waiting on us.
            </p>
          </section>

          <section>
            <h2 className="serif text-[19px] text-ink">Questions</h2>
            <p className="mt-3">
              If you have questions about this policy, reach out to the person who invited you,
              or through the contact details on postaud.io.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
