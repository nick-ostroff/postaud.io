import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";

export function Nav() {
  return (
    <nav className="sticky top-0 z-20 w-full border-b border-line bg-paper/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="PostAud.io home">
          <Wordmark className="text-xl" />
        </Link>

        <div className="flex items-center gap-7">
          <div className="hidden items-center gap-7 text-[13.5px] text-muted md:flex">
            <a href="#how-it-works" className="hover:text-ink">How it works</a>
            <a href="#why" className="hover:text-ink">Why</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
          </div>
          <Link href="/sign-in" className={buttonClasses({ variant: "secondary" })}>
            Sign in
          </Link>
        </div>
      </div>
    </nav>
  );
}
