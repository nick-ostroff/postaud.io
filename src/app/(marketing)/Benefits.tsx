import { Card } from "@/components/ui/Card";
import { BENEFITS } from "./content";

export function Benefits() {
  return (
    <section className="w-full px-6 py-28">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-5 sm:grid-cols-3">
        {BENEFITS.map((b) => (
          <Card key={b.title} className="px-6 py-7">
            <h3 className="serif text-[19px] text-ink">{b.title}</h3>
            <p className="mt-2.5 text-[14px] leading-[1.65] text-muted">{b.body}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
