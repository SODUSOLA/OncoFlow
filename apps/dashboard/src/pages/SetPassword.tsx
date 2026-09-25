import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "../lib/api";

// Where a newly provisioned staff member lands from their invite email to choose their own password.
export default function SetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("The two passwords don't match"); return; }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set the password");
    } finally {
      setSubmitting(false);
    }
  }

  const input = "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <img src="/oncoflow-logo.svg" alt="OncoFlow Limited" className="size-12" />
          <p className="mt-3 text-lg font-bold tracking-tight text-ink">ONCOFLOW LIMITED</p>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Staff Portal</p>
        </div>
        {done ? (
          <div className="space-y-4 rounded border border-gray-200 bg-white p-6 text-center">
            <h1 className="text-base font-semibold text-gray-900">Password set</h1>
            <p className="text-sm text-gray-500">You can now sign in with your email and new password.</p>
            <Link to="/login" className="block rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-600">Go to sign in</Link>
          </div>
        ) : !token ? (
          <p className="rounded border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">This link is missing its token. Use the link in your invite email.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded border border-gray-200 bg-white p-6">
            <h1 className="text-center text-base font-semibold text-gray-900">Choose your password</h1>
            <div>
              <label className="mb-1 block text-sm text-gray-600">New password (8+ characters)</label>
              <input type="password" minLength={8} required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className={input} autoComplete="new-password" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">Confirm password</label>
              <input type="password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} autoComplete="new-password" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-600 disabled:opacity-50">
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {submitting ? "Saving…" : "Set password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
