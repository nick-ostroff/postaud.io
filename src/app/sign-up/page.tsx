import Link from "next/link";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "Create your PostAud.io account" };

export default function SignUpPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
        Create your account
      </h1>
      <p className="mt-3 text-[15px] text-neutral-600 dark:text-neutral-400">
        Three free interviews per month. No credit card required.
      </p>
      <div className="mt-8">
        <SignUpForm />
      </div>
      <p className="mt-6 text-center text-[14px] text-neutral-600 dark:text-neutral-400">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
          Sign in
        </Link>
      </p>
    </div>
  );
}
