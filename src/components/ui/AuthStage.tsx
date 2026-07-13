import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Wordmark } from "@/components/ui/Wordmark";

/**
 * Shared stage for the auth pages that all repeat the same shell: a
 * centered card with the wordmark, a heading, a subtitle, and page-specific
 * content. `/sign-in` is deliberately excluded — it has its own bespoke
 * layout (decorative quote mark, atmospheric footer line).
 */
export function AuthStage({
  title,
  subtitle,
  children,
  below,
  cardClassName = "",
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  /** Optional content rendered below the card, still inside the centered stage. */
  below?: ReactNode;
  cardClassName?: string;
}) {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-paper px-6 py-14">
      <Card className={`w-full max-w-[400px] px-[38px] pt-9 pb-8 ${cardClassName}`}>
        <Link href="/" aria-label="PostAud.io home">
          <Wordmark className="text-xl" />
        </Link>

        <h1 className="serif mt-[18px] text-[27px] text-ink">{title}</h1>
        {subtitle && <p className="mb-6 mt-1 text-[13.5px] text-muted">{subtitle}</p>}

        {children}
      </Card>

      {below}
    </main>
  );
}
