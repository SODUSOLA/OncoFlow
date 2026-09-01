import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { VerifyEmailPanel } from "@/components/auth/VerifyEmailPanel";

export const metadata: Metadata = {
  title: "Verify Email",
  description: "Verify your email address to activate your OncoFlow account.",
};

export default function VerifyEmailPage() {
  return (
    <AuthCard
      title="Verify your email"
      footer={
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Back to log in
        </Link>
      }
    >
      <Suspense fallback={<p className="text-center text-sm text-neutral-400">Loading…</p>}>
        <VerifyEmailPanel />
      </Suspense>
    </AuthCard>
  );
}
