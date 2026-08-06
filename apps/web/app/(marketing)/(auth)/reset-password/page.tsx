import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your OncoFlow account.",
};

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Set a new password" description="Choose a new password for your account.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
