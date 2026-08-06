import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { RegisterWizard } from "@/components/auth/RegisterWizard";

export const metadata: Metadata = {
  title: "Register",
  description: "Register as a patient with OncoFlow and receive your permanent Unique Patient ID.",
};

export default function RegisterPage() {
  return (
    <AuthCard
      title="Register as a patient"
      description="A few short steps to set up your account and issue your permanent Unique Patient ID."
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Log in
          </Link>
        </p>
      }
    >
      <RegisterWizard />
    </AuthCard>
  );
}
