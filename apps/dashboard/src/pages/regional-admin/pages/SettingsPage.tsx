import { useState } from "react";
import { User, ShieldCheck, Monitor, Bell, Copy, Check } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Toggle } from "../../../components/ui/Toggle";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

// Settings limited to what the user table has (email, facility, MFA), since staff have no name, photo or preference columns.
export default function SettingsPage() {
  const { user, roles } = useAuth();
  const roleLabel = roles[0]?.roleDescription || roles[0]?.roleName.replace(/_/g, " ") || "Regional Admin";
  const initials = (user?.email.slice(0, 2) ?? "RA").toUpperCase();
  const displayName = (user?.email.split("@")[0] ?? "").replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="max-w-3xl space-y-4">
      <Card className="border-admin-border p-5">
        <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
          <User className="size-4 text-admin-text-secondary" aria-hidden="true" /> Profile Information
        </h2>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-admin-card-alt text-admin-h4 font-semibold text-admin-text">
            {initials}
          </div>
          {/* Disabled because staff accounts have no profile photo column or endpoint. */}
          <Button variant="outline" size="sm" disabled title="Not available — staff accounts have no profile photo field yet" className="rounded-admin-xs border-admin-border text-admin-text-secondary">
            Update Photo
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Full Name</label>
            {/* Disabled because staff have no name column; pre-filled from the email local part for display only. */}
            <input
              value={displayName}
              disabled
              title="Not editable — staff accounts have no name field yet"
              className="mt-0.5 w-full rounded-admin-sm border border-admin-border bg-admin-disabled px-3 py-2 text-admin-body-sm text-admin-text-secondary"
            />
          </div>
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Email</label>
            <input
              value={user?.email ?? ""}
              disabled
              className="mt-0.5 w-full rounded-admin-sm border border-admin-border bg-admin-disabled px-3 py-2 text-admin-body-sm text-admin-text-secondary"
            />
          </div>
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Role</label>
            <input
              value={roleLabel}
              disabled
              className="mt-0.5 w-full rounded-admin-sm border border-admin-border bg-admin-disabled px-3 py-2 text-admin-body-sm text-admin-text-secondary"
            />
          </div>
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Clinical ID</label>
            {/* Read-only; the user id stands in for a "Clinical ID" since staff accounts have no such column. */}
            <input
              value={user?.id.slice(0, 8).toUpperCase() ?? ""}
              disabled
              className="mt-0.5 w-full rounded-admin-sm border border-admin-border bg-admin-disabled px-3 py-2 font-mono text-admin-body-sm text-admin-text-secondary"
            />
          </div>
        </div>
      </Card>

      <MfaCard />

      <Card className="border-admin-border p-5 opacity-70">
        <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
          <Bell className="size-4 text-admin-text-secondary" aria-hidden="true" /> Alert Preferences
        </h2>
        <p className="mt-1 text-admin-caption text-admin-text-secondary">Not available yet — no per-user preferences are stored in this build; every admin currently gets every alert.</p>
        <div className="mt-4 space-y-4">
          <ToggleRow label="SLA Breach Alerts" description="Notify immediately upon inquiry SLA breach." checked={false} />
          <ToggleRow label="Inventory Variances" description="Weekly reconciliation reports." checked={false} />
        </div>
      </Card>

      <Card className="border-admin-border p-5 opacity-70">
        <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
          <Monitor className="size-4 text-admin-text-secondary" aria-hidden="true" /> System Display
        </h2>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="text-admin-body-sm font-medium text-admin-text">Theme Mode</p>
            <p className="text-admin-caption text-admin-text-secondary">Not available yet — this build has no dark theme.</p>
          </div>
          <div className="flex rounded-admin-sm border border-admin-border bg-admin-card-alt p-0.5 text-admin-caption font-medium text-admin-text-secondary">
            <span className="rounded-admin-xs bg-white px-3 py-1.5 shadow-admin-card">Light</span>
            <span className="px-3 py-1.5">Dark</span>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button
          disabled
          title="Nothing on this page has a real save action yet — MFA enrolls itself above, and every other field here is read-only or disabled"
          className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90"
        >
          Save Configurations
        </Button>
      </div>
    </div>
  );
}

// Preference toggle row with its description.
function ToggleRow({ label, description, checked }: { label: string; description: string; checked: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-admin-body-sm font-medium text-admin-text">{label}</p>
        <p className="text-admin-caption text-admin-text-secondary">{description}</p>
      </div>
      <Toggle checked={checked} disabled label={label} />
    </div>
  );
}

// Card for enrolling and confirming MFA.
function MfaCard() {
  const [step, setStep] = useState<"idle" | "enrolling" | "verifying">("idle");
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
        <div className="mt-4 flex items-center justify-between">
          <p className="text-admin-body-sm text-admin-text-secondary">Not enabled. Adds a 6-digit code from an authenticator app at sign-in.</p>
          <Button onClick={startEnrolment} loading={busy} size="sm" className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">Enable MFA</Button>
        </div>
      )}

      {enabled && step === "idle" && (
        <p className="mt-4 text-admin-body-sm text-admin-success">MFA is enabled on this account.</p>
      )}

      {step === "verifying" && secret && (
        <div className="mt-4 space-y-3">
          <p className="text-admin-body-sm text-admin-text-secondary">
            Add this key to an authenticator app (Google Authenticator, Authy, 1Password), then enter the
            6-digit code it generates to finish enabling MFA.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-admin-sm border border-admin-border bg-admin-card-alt px-3 py-2 font-mono text-admin-body-sm tracking-wider text-admin-text">
              {secret}
            </code>
            <button
              onClick={copySecret}
              title="Copy"
              className="rounded-admin-sm border border-admin-border p-2 text-admin-text-secondary hover:bg-admin-card-alt"
            >
              {copied ? <Check className="size-4 text-admin-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmCode()}
              placeholder="6-digit code"
              maxLength={6}
              className="w-32 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
            />
            <Button onClick={confirmCode} loading={busy} disabled={code.trim().length !== 6} size="sm" className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
              Verify &amp; Enable
            </Button>
            <Button onClick={() => { setStep("idle"); setSecret(null); setCode(""); }} variant="ghost" size="sm">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-admin-body-sm text-admin-danger">{error}</p>}
    </Card>
  );
}
