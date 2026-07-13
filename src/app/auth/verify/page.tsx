import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Wordmark } from "@/app/(marketing)/Nav";

export const metadata = { title: "Email verified" };

export default function VerifyPage() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-paper px-6 py-14">
      <Card className="w-full max-w-[400px] px-[38px] pt-9 pb-8 text-center">
        <Link href="/" aria-label="PostAud.io home">
          <Wordmark className="text-xl" />
        </Link>

        <h1 className="serif mt-[18px] text-[27px] text-ink">You&apos;re in.</h1>
        <p className="mb-6 mt-1 text-[13.5px] text-muted">
          Your email is verified and your account is ready.
        </p>

        <Link href="/app">
          <Button variant="primary" size="big" className="w-full justify-center">
            Go to your dashboard
          </Button>
        </Link>
      </Card>
    </main>
  );
}
