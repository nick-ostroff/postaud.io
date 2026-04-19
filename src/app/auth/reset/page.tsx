import { ResetForm } from "./ResetForm";

export const metadata = { title: "Reset your password" };

export default function ResetPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
        Reset your password
      </h1>
      <p className="mt-3 text-[15px] text-neutral-600 dark:text-neutral-400">
        Enter your email and we&apos;ll send you a link to choose a new password.
      </p>
      <div className="mt-8">
        <ResetForm />
      </div>
    </div>
  );
}
