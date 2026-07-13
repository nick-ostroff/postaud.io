import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Wordmark } from "@/app/(marketing)/Nav";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "Create your PostAud.io account" };

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-paper px-6 py-14">
      <Card className="w-full max-w-[400px] px-[38px] pt-9 pb-8">
        <Link href="/" aria-label="PostAud.io home">
          <Wordmark className="text-xl" />
        </Link>

        <h1 className="serif mt-[18px] text-[27px] text-ink">Create your account</h1>
        <p className="mb-6 mt-1 text-[13.5px] text-muted">
          Three free interviews per month. No credit card required.
        </p>

        <SignUpForm />
      </Card>

      <p className="mt-6 text-center text-[12.5px] text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-green-deep hover:text-ink">
          Sign in
        </Link>
      </p>
    </main>
  );
}
