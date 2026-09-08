import { useEffect, useState } from "react";
import { User, ShieldCheck, Monitor, Bell, Sliders, Copy, Check, CalendarClock, Plus, Trash2 } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Toggle } from "../../../components/ui/Toggle";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { cn } from "../../../lib/utils";
import type { ConsultantAvailability } from "../../../lib/types";

// Phase 7 — same pattern as Regional Admin's Settings phase (ONCOFLOW_REGIONAL_ADMIN_BUILD_GUIDE.md),
// reusing its shared <Toggle> rather than rebuilding one, scoped to what's actually real on the
// `user` table: email, facilityId, mfaEnabled/mfaSecret. No name/photo/specialization columns
// exist for staff accounts, and no per-user preference storage exists at all — every disabled
// control below says exactly why, same honesty rule as before.
export default function SettingsPage() {
  const { user, roles } = useAuth();
  const roleLabel = roles[0]?.roleDescription || "Consulting Oncologist";
  const initials = (user?.email.slice(0, 2) ?? "DR").toUpperCase();
  const displayName = (user?.email.split("@")[0] ?? "").replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const [videoQuality, setVideoQuality] = useState("auto");
  const [flagSensitivity, setFlagSensitivity] = useState(50);

  return (
    <div className="max-w-3xl space-y-4">
      <Card className="border-admin-border p-5">
        <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
          <User className="size-4 text-admin-text-secondary" aria-hidden="true" /> Profile Information
        </h2>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-admin-sidebar-cta text-admin-h4 font-semibold text-white">
            {initials}
          </div>
          <Button variant="outline" size="sm" disabled title="Not available — staff accounts have no profile photo field yet" className="rounded-admin-xs border-admin-border text-admin-text-secondary">
            Update Photo
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Full Name</label>
            <input value={displayName} disabled title="Not editable — staff accounts have no name field yet" className="mt-0.5 w-full rounded-admin-sm border border-admin-border bg-admin-disabled px-3 py-2 text-admin-body-sm text-admin-text-secondary" />
          </div>
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Email</label>
            <input value={user?.email ?? ""} disabled className="mt-0.5 w-full rounded-admin-sm border border-admin-border bg-admin-disabled px-3 py-2 text-admin-body-sm text-admin-text-secondary" />
          </div>
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Specialization</label>
            <input value={roleLabel} disabled title="Not editable — no specialization field exists yet; showing this account's role instead" className="mt-0.5 w-full rounded-admin-sm border border-admin-border bg-admin-disabled px-3 py-2 text-admin-body-sm text-admin-text-secondary" />
          </div>
          <div>
            <label className="text-admin-caption text-admin-text-secondary">Clinical ID</label>
            <input value={user?.id.slice(0, 8).toUpperCase() ?? ""} disabled className="mt-0.5 w-full rounded-admin-sm border border-admin-border bg-admin-disabled px-3 py-2 font-mono text-admin-body-sm text-admin-text-secondary" />
          </div>
        </div>
      </Card>

      <MfaCard />

      <AvailabilityCard consultantId={user?.id ?? null} />

      <Card className="border-admin-border p-5 opacity-70">
        <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
          <Sliders className="size-4 text-admin-text-secondary" aria-hidden="true" /> Consultation Preferences
        </h2>
        <p className="mt-1 text-admin-caption text-admin-text-secondary">
          No per-user preference storage exists in this build yet — controls below hold state locally in this
          tab only and are not saved.
        </p>
        <div className="mt-4 space-y-4">
          <ToggleRow label="Auto-join waiting room" description="Skip the Pre-call Briefing when the patient is already present." checked={false} disabled />
          <ToggleRow label="Record consultations" description="Requires a Daily.co recording add-on not enabled on this account." checked={false} disabled />
          <div>
            <p className="text-admin-body-sm font-medium text-admin-text">Default Video Quality</p>
            <select
              value={videoQuality}
              onChange={(e) => setVideoQuality(e.target.value)}
              className="mt-1.5 w-48 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm text-admin-text"
            >
              <option value="auto">Auto</option>
              <option value="hd">High Definition</option>
              <option value="sd">Standard Definition</option>
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="text-admin-body-sm font-medium text-admin-text">AI Flagging Sensitivity</p>
              <span className="text-admin-caption text-admin-text-secondary">{flagSensitivity}%</span>
            </div>
            <input
              type="range" min={0} max={100} value={flagSensitivity}
              onChange={(e) => setFlagSensitivity(Number(e.target.value))}
              className="mt-2 w-full accent-admin-sidebar-cta"
            />
            <p className="mt-1 text-admin-micro text-admin-text-secondary">
              Not wired to a real detection pipeline yet — this only holds local UI state.
            </p>
          </div>
        </div>
      </Card>

      <Card className="border-admin-border p-5 opacity-70">
        <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
          <Bell className="size-4 text-admin-text-secondary" aria-hidden="true" /> Alert Configuration
        </h2>
        <p className="mt-1 text-admin-caption text-admin-text-secondary">Not available yet — every consultant currently gets every alert.</p>
        <div className="mt-4 space-y-4">
          <ToggleRow label="Case Lock Alerts" description="Notify immediately when a case-lock triggers for one of my patients." checked={false} disabled />
          <ToggleRow label="Post-consult SLA Warnings" description="Notify as a finalize deadline approaches." checked={false} disabled />
        </div>
        <div className="mt-4">
          <p className="text-admin-body-sm font-medium text-admin-text">SLA Threshold</p>
          <div className="mt-2 flex gap-4 text-admin-body-sm text-admin-text-secondary">
            <label className="flex items-center gap-1.5 opacity-60"><input type="radio" disabled /> 12 hours</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked readOnly disabled /> 24 hours (fixed)</label>
          </div>
          <p className="mt-1 text-admin-micro text-admin-text-secondary">Fixed at 24h server-side — see Post-call Summary.</p>
        </div>
      </Card>

      <Card className="border-admin-border p-5 opacity-70">
        <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
          <Monitor className="size-4 text-admin-text-secondary" aria-hidden="true" /> Interface Settings
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
        <div className="mt-4 flex items-center justify-between">
          <p className="text-admin-body-sm font-medium text-admin-text">Font Scaling</p>
          <p className="text-admin-caption text-admin-text-secondary">Not available yet.</p>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button disabled title="Nothing on this page has a real save action yet — MFA enrolls itself above." className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
          Save Configurations
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, disabled }: { label: string; description: string; checked: boolean; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-admin-body-sm font-medium text-admin-text">{label}</p>
        <p className="text-admin-caption text-admin-text-secondary">{description}</p>
      </div>
      <Toggle checked={checked} disabled={disabled} label={label} />
    </div>
  );
}

function MfaCard() {
  const [step, setStep] = useState<"idle" | "enrolling" | "verifying">("idle");
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);

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
            Add this key to an authenticator app, then enter the 6-digit code it generates.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-admin-sm border border-admin-border bg-admin-card-alt px-3 py-2 font-mono text-admin-body-sm tracking-wider text-admin-text">
              {secret}
            </code>
            <button onClick={copySecret} title="Copy" className="rounded-admin-sm border border-admin-border p-2 text-admin-text-secondary hover:bg-admin-card-alt">
              {copied ? <Check className="size-4 text-admin-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmCode()}
              placeholder="6-digit code" maxLength={6}
              className={cn("w-32 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm")}
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

// ONCOFLOW_SCHEDULING_AND_VIDEO_LIFECYCLE.md §1 — "the literal source of truth Regional Admin's
// scheduler reads from." No separate "default days" concept: whatever's here for a future date
// IS the default. Real create/list/delete against /availability, not a preview mock.
function AvailabilityCard({ consultantId }: { consultantId: string | null }) {
  const [blocks, setBlocks] = useState<ConsultantAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!consultantId) { setLoading(false); return; }
    let cancelled = false;
    api.get<{ availability: ConsultantAvailability[] }>(`/availability?consultantId=${consultantId}`)
      .then((d) => { if (!cancelled) setBlocks(d.availability); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [consultantId]);

  async function addBlock() {
    if (!date || !start || !end) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ availability: ConsultantAvailability }>("/availability", {
        availableDate: date, startTime: start, endTime: end,
      });
      setBlocks((prev) => [...prev, res.availability].sort((a, b) => a.availableDate.localeCompare(b.availableDate)));
      setDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add availability");
    } finally {
      setSaving(false);
    }
  }

  async function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    await api.del(`/availability/${id}`).catch(() => {});
  }

  return (
    <Card className="border-admin-border p-5">
      <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
        <CalendarClock className="size-4 text-admin-text-secondary" aria-hidden="true" /> Availability
      </h2>
      <p className="mt-1 text-admin-caption text-admin-text-secondary">
        Regional Admin can only schedule a New Consultation with you inside these blocks — this is the real
        constraint enforced server-side, not a display-only calendar.
      </p>

      {loading ? (
        <p className="mt-4 text-admin-body-sm text-admin-text-secondary">Loading…</p>
      ) : blocks.length === 0 ? (
        <p className="mt-4 text-admin-body-sm text-admin-text-secondary">No availability set yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-admin-sm bg-admin-card-alt px-3 py-2 text-admin-body-sm">
              <span className="text-admin-text">
                {new Date(`${b.availableDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                <span className="ml-2 text-admin-text-secondary">{b.startTime.slice(0, 5)}–{b.endTime.slice(0, 5)}</span>
              </span>
              <button onClick={() => removeBlock(b.id)} className="text-admin-text-secondary hover:text-admin-danger" title="Remove">
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-admin-border pt-4">
        <div>
          <label className="text-admin-caption text-admin-text-secondary">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5 block rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm" />
        </div>
        <div>
          <label className="text-admin-caption text-admin-text-secondary">Start</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-0.5 block rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm" />
        </div>
        <div>
          <label className="text-admin-caption text-admin-text-secondary">End</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-0.5 block rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm" />
        </div>
        <Button onClick={addBlock} loading={saving} disabled={!date} size="sm" className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
          <Plus className="size-3.5" aria-hidden="true" /> Add
        </Button>
      </div>
      {error && <p className="mt-2 text-admin-body-sm text-admin-danger">{error}</p>}
    </Card>
  );
}
