import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Copy, Check, LogOut, Monitor, SlidersHorizontal } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { cn } from "../../../lib/utils";
import { getTextSize, setTextSize, type TextSize } from "../lib/preferences";

// Card for enrolling and confirming MFA.
function MfaCard() {
  const [step, setStep] = useState<"idle" | "verifying">("idle");
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  // Starts from what the account really has, not always "off".
  const [enabled, setEnabled] = useState(user?.mfaEnabled ?? false);

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

interface SessionRow { id: string; device: string; ip: string; createdAt: string; isCurrent: boolean }

// Where this account is signed in, with a way to end the ones you don't recognise.
function SessionsCard() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Reloads the account's active sessions.
  function load() {
    api.get<{ sessions: SessionRow[] }>("/auth/sessions").then((d) => setSessions(d.sessions)).catch(() => {});
  }
  useEffect(load, []);

  // Ends another session (the current one is ended by signing out).
  async function revoke(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.post(`/auth/sessions/${id}/revoke`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not end that session");
    } finally {
      setBusyId(null);
    }
  }

  // This device first, then the most recent others.
  const ordered = [...sessions].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.createdAt.localeCompare(a.createdAt));
  const visible = showAll ? ordered : ordered.slice(0, 3);

  return (
    <Card className="border-admin-border p-5">
      <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
        <Monitor className="size-4 text-admin-text-secondary" aria-hidden="true" /> Active Sessions
      </h2>
      <ul className="mt-3 space-y-2">
        {visible.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 rounded-admin-sm bg-admin-card-alt px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-admin-body-sm text-admin-text">{s.device === "unknown" ? "Unknown device" : s.device}{s.isCurrent && <span className="ml-1.5 text-admin-micro font-semibold text-admin-success">This device</span>}</p>
              <p className="text-admin-micro text-admin-text-secondary">{s.ip} · signed in {new Date(s.createdAt).toLocaleString()}</p>
            </div>
            {!s.isCurrent && (
              <Button onClick={() => revoke(s.id)} loading={busyId === s.id} variant="outline" size="sm" className="shrink-0 rounded-admin-xs">End</Button>
            )}
          </li>
        ))}
      </ul>
      {ordered.length > 3 && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-admin-caption font-semibold text-admin-sidebar-cta">
          {showAll ? "Show fewer" : `Show all ${ordered.length} sessions`}
        </button>
      )}
      {error && <p className="mt-2 text-admin-micro text-admin-danger">{error}</p>}
    </Card>
  );
}

// Display preferences. Stored on this device only — the server has no per-user preference storage yet.
function PreferencesCard() {
  const [size, setSize] = useState<TextSize>(getTextSize());
  const OPTIONS: { id: TextSize; label: string }[] = [{ id: "small", label: "Small" }, { id: "default", label: "Default" }, { id: "large", label: "Large" }];

  // Applies and saves the chosen size.
  function choose(next: TextSize) {
    setSize(next);
    setTextSize(next);
  }

  return (
    <Card className="border-admin-border p-5">
      <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
        <SlidersHorizontal className="size-4 text-admin-text-secondary" aria-hidden="true" /> Preferences
      </h2>
      <p className="mt-3 text-admin-body-sm font-medium text-admin-text">Text size</p>
      <div className="mt-1.5 flex gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.id} onClick={() => choose(o.id)} aria-pressed={size === o.id}
            className={cn("flex-1 rounded-admin-sm border px-3 py-1.5 text-admin-body-sm", size === o.id ? "border-admin-sidebar-cta bg-admin-sidebar-cta/10 text-admin-sidebar-cta" : "border-admin-border text-admin-text-secondary")}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-admin-micro text-admin-text-secondary">Saved on this device only.</p>
    </Card>
  );
}

// Settings: security (MFA, active sessions), preferences, and signing out. Who you are — image, name,
// designation, hospital — is on the Profile page (the avatar, top right).
export default function SettingsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  // Signs out and returns to the login screen.
  async function signOut() {
    setSigningOut(true);
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="space-y-4">
      <p className="text-admin-h4 text-admin-text">Settings</p>

      <MfaCard />
      <SessionsCard />
      <PreferencesCard />

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
