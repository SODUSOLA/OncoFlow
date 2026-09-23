import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, ShieldCheck, Copy, Check, LogOut } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { cn } from "../../../lib/utils";
import type { Facility } from "../../../lib/types";

// Card for enrolling and confirming MFA.
function MfaCard() {
  const [step, setStep] = useState<"idle" | "verifying">("idle");
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);

  // Starts MFA enrolment and shows the secret.
  async function startEnrolment() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ secret: string }>("/auth/mfa/enroll");
      setSecret(res.secret);
      setStep("verifying");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start enrolment");
    } finally {
      setBusy(false);
    }
  }

  // Confirms MFA by verifying the entered code.
  async function confirmCode() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/mfa/verify", { code: code.trim() });
      setEnabled(true);
      setStep("idle");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code — check your authenticator app and try again");
    } finally {
      setBusy(false);
    }
  }

  // Copies the MFA secret to the clipboard.
  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className="border-admin-border p-5">
      <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
        <ShieldCheck className="size-4 text-admin-text-secondary" aria-hidden="true" /> Multi-Factor Authentication
      </h2>

      {step === "idle" && !enabled && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-admin-body-sm text-admin-text-secondary">Not enabled. Adds a 6-digit code from an authenticator app at sign-in.</p>
          <Button onClick={startEnrolment} loading={busy} size="sm" className="shrink-0 rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">Enable MFA</Button>
        </div>
      )}

      {enabled && step === "idle" && (
        <p className="mt-4 text-admin-body-sm text-admin-success">MFA is enabled on this account.</p>
      )}

      {step === "verifying" && secret && (
        <div className="mt-4 space-y-3">
          <p className="text-admin-body-sm text-admin-text-secondary">
            Add this key to an authenticator app, then enter the 6-digit code it generates.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-admin-sm border border-admin-border bg-admin-card-alt px-3 py-2 font-mono text-admin-body-sm tracking-wider text-admin-text">
              {secret}
            </code>
            <button onClick={copySecret} title="Copy" className="shrink-0 rounded-admin-sm border border-admin-border p-2 text-admin-text-secondary hover:bg-admin-card-alt">
              {copied ? <Check className="size-4 text-admin-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmCode()}
              placeholder="6-digit code" maxLength={6}
              className="w-32 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
            />
            <Button onClick={confirmCode} loading={busy} disabled={code.trim().length !== 6} size="sm" className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
              Verify &amp; Enable
            </Button>
            <Button onClick={() => { setStep("idle"); setSecret(null); setCode(""); }} variant="ghost" size="sm">Cancel</Button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-admin-body-sm text-admin-danger">{error}</p>}
    </Card>
  );
}

// Settings limited to what the user table has (email, facility, MFA) — the avatar in the header opens this
// page rather than signing out directly, and signing out is its own explicit action here.
export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [facilityName, setFacilityName] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const initials = (user?.email.slice(0, 2) ?? "NO").toUpperCase();

  useEffect(() => {
    if (!user?.facilityId) return;
    api.get<{ facilities: Facility[] }>("/facilities")
      .then((d) => setFacilityName(d.facilities.find((f) => f.id === user.facilityId)?.name ?? null))
      .catch(() => {});
  }, [user?.facilityId]);

  // Signs out and returns to the login screen.
  async function signOut() {
    setSigningOut(true);
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="space-y-4">
      <p className="text-admin-h4 text-admin-text">Settings</p>

      <Card className="border-admin-border p-5">
        <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
          <User className="size-4 text-admin-text-secondary" aria-hidden="true" /> Profile Information
        </h2>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-admin-sidebar-cta text-admin-h4 font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-admin-body font-semibold text-admin-text">{user?.email}</p>
            <p className="text-admin-caption text-admin-text-secondary">Onsite Nursing Officer{facilityName ? ` · ${facilityName}` : ""}</p>
          </div>
        </div>
      </Card>

      <MfaCard />

      <Card className="border-admin-border p-4">
        <button
          onClick={signOut}
          disabled={signingOut}
          className={cn("flex w-full items-center justify-center gap-2 rounded-admin-xs border border-admin-danger/40 py-2.5 text-admin-body-sm font-medium text-admin-danger hover:bg-admin-danger/5", signingOut && "opacity-60")}
        >
          <LogOut className="size-4" aria-hidden="true" /> {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </Card>
    </div>
  );
}
