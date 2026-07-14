import { WaitlistForm } from "@/components/waitlist/WaitlistForm";

export function Hero() {
  return (
    <section className="relative w-full overflow-hidden px-6 pt-24 pb-28">
      {/* Decorative. Bleeds off the top-left, like the login mockup. */}
      <span
        aria-hidden="true"
        className="serif pointer-events-none absolute -top-[120px] left-4 select-none text-[340px] font-light italic leading-none text-[rgba(33,30,26,0.045)]"
      >
        &rdquo;
      </span>

      <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <h1 className="serif text-[40px] leading-[1.15] text-ink md:text-[60px]">
          The stories leave with the person.
          <br />
          Unless someone asks.
        </h1>

        <p className="mt-7 max-w-xl text-[16.5px] leading-[1.65] text-muted">
          PostAud.io is an AI interviewer that sits down with the people who know things
          — and turns what they say into a knowledge base that grows every time you talk.
        </p>

        <WaitlistForm source="hero" className="mt-10 w-full max-w-md" />

        <p className="serif mt-14 text-[16px] italic text-faint">
          &raquo;Tell me about the ferry.&laquo;
        </p>
      </div>
    </section>
  );
}
