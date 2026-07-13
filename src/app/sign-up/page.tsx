import Link from "next/link";
import { AuthStage } from "@/components/ui/AuthStage";
import { SignUpForm } from "./SignUpForm";

export const metadata = {
  title: "Create your account",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <AuthStage
      title="Create your account"
      subtitle="Three free interviews to get started. No credit card required."
      below={
        <p className="mt-6 text-center text-[12.5px] text-muted">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-green-deep hover:text-ink">
            Sign in
          </Link>
        </p>
      }
    >
      <SignUpForm />
    </AuthStage>
  );
}
