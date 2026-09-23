import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your OncoFlow account.",
};

// Reset-password page.
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Set a new password" description="Choose a new password for your account.">
      <Suspense fallback={<p className="text-center text-sm text-neutral-400">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
