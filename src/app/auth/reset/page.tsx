import { AuthStage } from "@/components/ui/AuthStage";
import { ResetForm } from "./ResetForm";

export const metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ResetPage() {
  return (
    <AuthStage
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to choose a new password."
    >
      <ResetForm />
    </AuthStage>
  );
}
