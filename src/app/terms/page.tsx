import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <main className="flex w-full flex-col items-center bg-paper px-6 py-16">
      {/* TODO: reviewed by Nick — plain-language draft, not legal advice. */}
      <div className="w-full max-w-2xl">
        <Link href="/" aria-label="PostAud.io home">
          <Wordmark className="text-xl" />
        </Link>

        <h1 className="serif mt-8 text-[32px] text-ink">Terms of Service</h1>
        <p className="mt-2 text-[13px] text-muted">Last updated July 2026.</p>

        <div className="mt-8 space-y-7 text-[14.5px] leading-[1.7] text-ink-soft">
          <p>
            These are the terms for using PostAud.io. By creating an account or joining the
            waitlist, you agree to them.
          </p>

          <section>
            <h2 className="serif text-[19px] text-ink">The service</h2>
            <p className="mt-3">
              PostAud.io is a voice-first AI interviewer. You start a series, an AI interviewer
              asks questions and listens to the answers, and a knowledge base of facts, people,
              places, and dates builds up over time. Interviews are processed using third-party
              AI providers — OpenAI for the voice conversation and Anthropic for extracting facts
              from the transcript — to make this work.
            </p>
          </section>

          <section>
            <h2 className="serif text-[19px] text-ink">Your account</h2>
            <p className="mt-3">
              You&rsquo;re responsible for keeping your account credentials secure and for what happens
              under your account. New accounts start with a limited number of free interviews.
            </p>
          </section>

          <section>
            <h2 className="serif text-[19px] text-ink">Your content</h2>
            <p className="mt-3">
              What you and the people you interview say remains yours. We store it so the
              product can work — playing back audio, building the knowledge base, and generating
              exports — and access to a series is limited to the people you invite to it. You can
              export everything you&rsquo;ve recorded as a Markdown file at any time.
            </p>
          </section>

          <section>
            <h2 className="serif text-[19px] text-ink">Acceptable use</h2>
            <p className="mt-3">
              Don&rsquo;t use PostAud.io to record someone without their knowledge or consent, or to
              interview someone who hasn&rsquo;t agreed to be part of a series. Don&rsquo;t try to break,
              abuse, or overload the service.
            </p>
          </section>

          <section>
            <h2 className="serif text-[19px] text-ink">Changes</h2>
            <p className="mt-3">
              PostAud.io is an early-stage product and these terms may change as it develops.
              We&rsquo;ll update this page when they do.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
