import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const metadata = { title: "Choose a new password" };

export default function UpdatePasswordPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
        Choose a new password
      </h1>
      <p className="mt-3 text-[15px] text-neutral-600 dark:text-neutral-400">
        At least 8 characters.
      </p>
      <div className="mt-8">
        <UpdatePasswordForm />
      </div>
    </div>
  );
}
