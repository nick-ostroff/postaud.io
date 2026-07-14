import { Card } from "@/components/ui/Card";

const facts = [
  { kind: "Person", value: "Aunt Rina", detail: "Travelled with her; sister-in-law" },
  { kind: "Place", value: "The Hoek van Holland ferry", detail: "Crossing to Harwich, winter" },
  { kind: "Date", value: "January 1953", detail: "Two weeks before the North Sea flood" },
];

export function ProductMoment() {
  return (
    <section className="w-full bg-paper-2 px-6 py-28">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="serif text-[30px] text-ink md:text-[38px]">
            A conversation. Then, quietly, a record.
          </h2>
          <p className="mt-5 text-[15.5px] leading-[1.65] text-muted">
            Anna doesn&rsquo;t work from a script. She listens to the answer and follows the
            thread that matters — and while she does it, the knowledge base fills in behind her.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.35fr_1fr]">
          {/* The live-interview surface — the same dark session UI the product uses. */}
          <div className="dark-session rounded-card p-8 shadow-pop md:p-10">
            <div className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.1em] text-dark-muted uppercase">
              <span className="h-1.5 w-1.5 rounded-pill bg-mint" />
              Session 4 · live
            </div>

            <div className="mt-8 space-y-7">
              <p className="spoken text-[19px] leading-[1.55] md:text-[21px]">
                &raquo;Tell me about the ferry.&laquo;
              </p>

              <p className="text-[14.5px] leading-[1.7] text-dark-muted">
                Oh, the ferry. We went over in the winter — it was rough, everyone was sick.
                Rina held my hand the whole way and pretended she wasn&rsquo;t frightened.
                That was two weeks before the water came.
              </p>

              <p className="spoken text-[19px] leading-[1.55] md:text-[21px]">
                &raquo;Two weeks before the water came. You mean the flood?&laquo;
              </p>
            </div>

            <div className="mt-9 border-t border-dark-line pt-5 text-[12.5px] text-dark-muted">
              She asked about the flood because your mother mentioned the water — not because
              a script told her to.
            </div>
          </div>

          {/* What that exchange produced, with no effort from anyone. */}
          <div>
            <div className="text-[11.5px] font-semibold tracking-[0.1em] text-muted uppercase">
              Added to the knowledge base
            </div>

            <div className="mt-4 space-y-3">
              {facts.map((f) => (
                <Card key={f.value} className="px-5 py-4">
                  <div className="text-[11px] font-semibold tracking-[0.08em] text-green-deep uppercase">
                    {f.kind}
                  </div>
                  <div className="serif mt-1.5 text-[17px] text-ink">{f.value}</div>
                  <div className="mt-1 text-[13px] text-muted">{f.detail}</div>
                </Card>
              ))}
            </div>

            <p className="mt-5 text-[13px] leading-[1.6] text-muted">
              Nobody tagged anything. Nobody filled out a form. Someone just told a story.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
