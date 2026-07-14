import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";

export function Footer() {
  return (
    <footer className="w-full border-t border-line bg-paper px-6 py-14">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Wordmark className="text-lg" />
          <p className="mt-3 text-[13px] leading-[1.6] text-muted">
            An AI interviewer that turns conversation into a knowledge base worth keeping.
          </p>
        </div>

        <div className="flex gap-16">
          <div>
            <div className="text-[11.5px] font-semibold tracking-[0.1em] text-muted uppercase">
              Product
            </div>
            <ul className="mt-3.5 space-y-2.5 text-[13.5px] text-muted">
              <li><a href="#how-it-works" className="hover:text-ink">How it works</a></li>
              <li><a href="#faq" className="hover:text-ink">FAQ</a></li>
              <li><Link href="/sign-in" className="hover:text-ink">Sign in</Link></li>
            </ul>
          </div>

          <div>
            <div className="text-[11.5px] font-semibold tracking-[0.1em] text-muted uppercase">
              Legal
            </div>
            <ul className="mt-3.5 space-y-2.5 text-[13.5px] text-muted">
              <li><Link href="/privacy" className="hover:text-ink">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-ink">Terms</Link></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-12 w-full max-w-6xl border-t border-line pt-6 text-[12.5px] text-muted">
        © {new Date().getFullYear()} PostAud.io
      </div>
    </footer>
  );
}
