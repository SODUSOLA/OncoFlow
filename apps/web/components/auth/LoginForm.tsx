"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input, PasswordInput } from "@/components/ui/Field";
import { api } from "@/lib/api";

// The backend only authenticates by email today, so the field is scoped to that — phone-based
// login would need the backend to support looking a user up by phone first.
const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:5174";

interface LoginResponse {
  roles: { roleName: string }[];
}

export function LoginForm() {
  const router = useRouter();
  const [values, setValues] = useState({ identifier: "", password: "" });
  const [errors, setErrors] = useState<{ identifier?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!values.identifier.trim()) nextErrors.identifier = "Enter your email address.";
    if (!values.password) nextErrors.password = "Enter your password.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const res = await api.post<LoginResponse>("/auth/login", {
        email: values.identifier.trim(),
        password: values.password,
      });
      const isPatient = res.roles.some((role) => role.roleName === "PATIENT");
      if (isPatient) {
        router.push("/home");
      } else {
        window.location.href = DASHBOARD_URL;
      }
    } catch (err) {
      setLoading(false);
      setErrors({ form: err instanceof Error ? err.message : "Invalid email or password" });
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <FieldWrapper label="Email address" htmlFor="identifier" error={errors.identifier} required>
        <Input
          id="identifier"
          type="email"
          value={values.identifier}
          error={!!errors.identifier}
          onChange={(e) => setValues((v) => ({ ...v, identifier: e.target.value }))}
          placeholder="you@example.com"
          autoComplete="username"
        />
      </FieldWrapper>

      <FieldWrapper label="Password" htmlFor="password" error={errors.password} required>
        <PasswordInput
          id="password"
          value={values.password}
          error={!!errors.password}
          onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
          autoComplete="current-password"
        />
      </FieldWrapper>

      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          Forgot password?
        </Link>
      </div>

      {errors.form && (
        <p role="alert" className="rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning">
          {errors.form}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Log In
      </Button>
    </form>
  );
}
