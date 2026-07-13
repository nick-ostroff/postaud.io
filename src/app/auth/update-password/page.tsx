import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Wordmark } from "@/app/(marketing)/Nav";
import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const metadata = { title: "Choose a new password" };

export default function UpdatePasswordPage() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-paper px-6 py-14">
      <Card className="w-full max-w-[400px] px-[38px] pt-9 pb-8">
        <Link href="/" aria-label="PostAud.io home">
          <Wordmark className="text-xl" />
        </Link>

        <h1 className="serif mt-[18px] text-[27px] text-ink">Choose a new password</h1>
        <p className="mb-6 mt-1 text-[13.5px] text-muted">At least 8 characters.</p>

        <UpdatePasswordForm />
      </Card>
    </main>
  );
}
