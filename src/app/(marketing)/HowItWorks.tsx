import { HOW_IT_WORKS } from "./content";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="w-full px-6 py-28">
      <div className="mx-auto w-full max-w-5xl">
        <h2 className="serif text-center text-[30px] text-ink md:text-[38px]">How it works</h2>

        <div className="mt-16 grid grid-cols-1 gap-12 md:grid-cols-3">
          {HOW_IT_WORKS.map((step) => (
            <div key={step.n}>
              <div className="serif text-[15px] text-green-deep">{step.n}</div>
              <h3 className="serif mt-3 text-[21px] text-ink">{step.title}</h3>
              <p className="mt-2.5 text-[14.5px] leading-[1.65] text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
