import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { AuthStage } from "@/components/ui/AuthStage";

export const metadata = {
  title: "Email verified",
  robots: { index: false, follow: false },
};

export default function VerifyPage() {
  return (
    <AuthStage
      title="You're in."
      subtitle="Your email is verified and your account is ready."
      cardClassName="text-center"
    >
      <Link href="/app" className={buttonClasses({ variant: "primary", size: "big", className: "w-full justify-center" })}>
        Go to your dashboard
      </Link>
    </AuthStage>
  );
}
