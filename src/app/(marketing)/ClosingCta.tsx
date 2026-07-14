import { WaitlistForm } from "@/components/waitlist/WaitlistForm";

export function ClosingCta() {
  return (
    <section className="w-full border-t border-line bg-paper-2 px-6 py-28">
      <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
        <h2 className="serif text-[28px] leading-[1.35] text-ink md:text-[34px]">
          The best time to ask was ten years ago.
        </h2>
        <p className="mt-4 text-[15.5px] text-muted">
          We&rsquo;re opening PostAud.io to a small group first. Leave your email and we&rsquo;ll
          come find you.
        </p>
        <WaitlistForm source="footer" className="mt-9 w-full max-w-md" />
      </div>
    </section>
  );
}
