import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to your OncoFlow account.",
};

// Patient login page.
export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      description="Log in to continue your care journey or clinical workflow."
      footer={
        <p>
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            Register as a patient
          </Link>
        </p>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
