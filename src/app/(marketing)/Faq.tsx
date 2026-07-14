import { FAQS } from "./content";

export function Faq() {
  return (
    <section id="faq" className="w-full px-6 py-28">
      <div className="mx-auto w-full max-w-3xl">
        <h2 className="serif text-center text-[30px] text-ink md:text-[38px]">Questions</h2>

        <div className="mt-12 divide-y divide-line border-y border-line">
          {FAQS.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="serif flex cursor-pointer list-none items-center justify-between gap-4 text-[18px] text-ink marker:hidden">
                {f.q}
                <span
                  aria-hidden="true"
                  className="text-[20px] leading-none text-faint transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-[14.5px] leading-[1.7] text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
