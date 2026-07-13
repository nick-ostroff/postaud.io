import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Wordmark } from "@/app/(marketing)/Nav";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in — PostAud.io" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-paper px-6 py-14">
      <span
        aria-hidden="true"
        className="serif pointer-events-none absolute -top-[60px] left-8 select-none text-[340px] font-light italic leading-none text-[rgba(33,30,26,0.045)]"
      >
        &rdquo;
      </span>

      <Card className="relative w-full max-w-[400px] px-[38px] pt-9 pb-8">
        <Link href="/" aria-label="PostAud.io home">
          <Wordmark className="text-xl" />
        </Link>

        <h1 className="serif mt-[18px] text-[27px] text-ink">Welcome back</h1>
        <p className="mb-6 mt-1 text-[13.5px] text-muted">Sign in to keep the stories going.</p>

        {error && (
          <div className="mb-5 rounded-sm border border-amber-tint bg-amber-tint px-4 py-3 text-[13.5px] text-amber">
            {error}
          </div>
        )}

        <SignInForm next={next} />
      </Card>

      <p className="relative mt-6 text-center text-[12.5px] text-muted">
        New here? Someone in your family usually opens the door.
      </p>

      <p className="serif relative mt-14 text-[16px] italic text-faint">
        &raquo;Tell me about the ferry.&laquo;
      </p>
    </main>
  );
}
