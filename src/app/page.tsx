import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const features = [
  {
    title: "Voice-first interviews",
    body: "Anna asks one question at a time, listens, and follows up — a real conversation, not a form.",
  },
  {
    title: "A knowledge base that compounds",
    body: "Every session adds facts, people, places, and dates to a living record that only grows.",
  },
  {
    title: "Export it as Markdown",
    body: "Everything Anna has learned, yours to keep — no lock-in, no waiting on us.",
  },
];

export default function MarketingHome() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-paper text-ink">
      <nav className="w-full border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="serif text-xl">
            PostAud.io
          </Link>
          <Link href="/sign-in">
            <Button variant="primary">Sign in</Button>
          </Link>
        </div>
      </nav>

      <main className="flex w-full flex-1 flex-col items-center px-6 py-24 text-center">
        <h1 className="serif max-w-3xl text-[40px] leading-[1.2] text-ink md:text-[56px]">
          An AI interviewer that builds knowledge through conversation.
        </h1>
        <p className="mt-6 max-w-xl text-[16px] leading-[1.6] text-muted">
          The transcript isn&rsquo;t the product — the growing knowledge base is. Every
          conversation adds facts, memories, and context that stay organized and get richer
          over time.
        </p>

        <Link href="/sign-in" className="mt-9">
          <Button variant="primary" size="big">
            Sign in to get started
          </Button>
        </Link>

        <div className="mt-20 grid w-full max-w-4xl grid-cols-1 gap-4 text-left sm:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="px-6 py-6">
              <h3 className="text-[15px]">{f.title}</h3>
              <p className="mt-2 text-[13.5px] leading-[1.55] text-muted">{f.body}</p>
            </Card>
          ))}
        </div>
      </main>

      <footer className="w-full border-t border-line py-8 text-center text-[12.5px] text-faint">
        © {new Date().getFullYear()} PostAud.io
      </footer>
    </div>
  );
}
