import { AUDIENCES } from "./content";

export function WhoItsFor() {
  return (
    <section className="w-full border-y border-line bg-paper-2 px-6 py-24">
      <div className="mx-auto w-full max-w-5xl">
        <h2 className="serif text-center text-[30px] text-ink md:text-[38px]">
          For anyone who knows something nobody wrote down.
        </h2>

        <div className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3">
          {AUDIENCES.map((a) => (
            <div key={a.title}>
              <h3 className="text-[12px] font-semibold tracking-[0.1em] text-green-deep uppercase">
                {a.title}
              </h3>
              <p className="serif mt-3 text-[18px] leading-[1.5] text-ink-soft">{a.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
