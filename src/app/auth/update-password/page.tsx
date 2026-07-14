import { AuthStage } from "@/components/ui/AuthStage";
import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

export default function UpdatePasswordPage() {
  return (
    <AuthStage title="Choose a new password" subtitle="At least 8 characters.">
      <UpdatePasswordForm />
    </AuthStage>
  );
}
