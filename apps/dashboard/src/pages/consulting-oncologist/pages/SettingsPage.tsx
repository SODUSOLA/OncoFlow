import { useEffect, useMemo, useState } from "react";
import { DeviceNotificationsCard } from "../../../components/DeviceNotificationsCard";
import { User, ShieldCheck, Monitor, Bell, Sliders, Copy, Check, CalendarClock } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Toggle } from "../../../components/ui/Toggle";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { cn } from "../../../lib/utils";
import type { ConsultantAvailability } from "../../../lib/types";

// Settings limited to what the user table has (email, facility, MFA); unsupported controls are disabled with a reason.
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

      <DeviceNotificationsCard />

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

// Disabled preference toggle row with its explanation.
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

const MIN_AVAILABLE_DAYS = 3;
const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

interface DayChoice { startTime: string; endTime: string }

// The Lagos calendar date `offset` days from today, as YYYY-MM-DD (the server counts days in Lagos time too).
function lagosDate(offset: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + offset * 86_400_000));
}

// Day boxes for the next 7 days: pick a day to open its time range, and save once at least 3 days are chosen.
function AvailabilityCard({ consultantId }: { consultantId: string | null }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => lagosDate(i)), []);
  const [choices, setChoices] = useState<Record<string, DayChoice>>({});
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Loads the blocks already saved for the coming week so the boxes show the current state.
  useEffect(() => {
    if (!consultantId) { setLoading(false); return; }
    let cancelled = false;
    api.get<{ availability: ConsultantAvailability[] }>(`/availability?consultantId=${consultantId}`)
      .then((d) => {
        if (cancelled) return;
        const next: Record<string, DayChoice> = {};
        for (const b of d.availability) {
          if (days.includes(b.availableDate) && !next[b.availableDate]) {
            next[b.availableDate] = { startTime: b.startTime.slice(0, 5), endTime: b.endTime.slice(0, 5) };
          }
        }
        setChoices(next);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [consultantId, days]);

  const selectedCount = Object.keys(choices).length;
  const invalidDay = Object.entries(choices).find(([, c]) => !c.startTime || !c.endTime || c.startTime >= c.endTime)?.[0];
  const canSave = selectedCount >= MIN_AVAILABLE_DAYS && !invalidDay;

  // Selecting an unchosen day adds it with default hours and opens its time box; selecting a chosen day just opens its box.
  function pickDay(date: string) {
    setMessage(null);
    setChoices((prev) => (prev[date] ? prev : { ...prev, [date]: { startTime: DEFAULT_START, endTime: DEFAULT_END } }));
    setOpenDay((prev) => (prev === date ? null : date));
  }

  // Clears a day from the week.
  function removeDay(date: string) {
    setMessage(null);
    setChoices((prev) => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
    setOpenDay(null);
  }

  function setTime(date: string, field: keyof DayChoice, value: string) {
    setMessage(null);
    setChoices((prev) => ({ ...prev, [date]: { ...(prev[date] ?? { startTime: DEFAULT_START, endTime: DEFAULT_END }), [field]: value } }));
  }

  // Replaces the week's availability with the chosen days.
  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await api.put("/availability/week", {
        days: Object.entries(choices).map(([availableDate, c]) => ({ availableDate, startTime: c.startTime, endTime: c.endTime })),
      });
      setMessage({ kind: "success", text: "Availability saved." });
      setOpenDay(null);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not save availability" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-admin-border p-5">
      <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
        <CalendarClock className="size-4 text-admin-text-secondary" aria-hidden="true" /> Availability
      </h2>
      <p className="mt-1 text-admin-caption text-admin-text-secondary">
        Pick the days you can take consultations in the next 7 days, then set your hours for each. You must be
        available on at least {MIN_AVAILABLE_DAYS} days. Regional Admin can only schedule a New Consultation with
        you inside these hours.
      </p>

      {loading ? (
        <p className="mt-4 text-admin-body-sm text-admin-text-secondary">Loading…</p>
      ) : (
        <div className="relative mt-4 grid grid-cols-7 gap-2">
          {days.map((date, index) => {
            const chosen = choices[date];
            const isOpen = openDay === date && !!chosen;
            const d = new Date(`${date}T00:00:00`);
            return (
              <div key={date} className="relative">
                <button
                  type="button"
                  onClick={() => pickDay(date)}
                  aria-pressed={!!chosen}
                  aria-expanded={isOpen}
                  className={cn(
                    "flex w-full flex-col items-center rounded-admin-sm border px-1 py-3 text-center transition-colors",
                    chosen
                      ? "border-admin-sidebar-cta bg-admin-sidebar-cta text-white"
                      : "border-admin-border bg-admin-card-alt text-admin-text hover:border-admin-sidebar-cta",
                  )}
                >
                  <span className="text-admin-caption uppercase">{index === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                  <span className="text-admin-h4">{d.getDate()}</span>
                  <span className="text-admin-caption opacity-80">{d.toLocaleDateString(undefined, { month: "short" })}</span>
                  <span className="mt-1 min-h-4 text-[10px] leading-4">{chosen ? `${chosen.startTime}–${chosen.endTime}` : ""}</span>
                </button>

                {isOpen && (
                  <div
                    className={cn(
                      "absolute top-full z-10 mt-2 w-72 rounded-admin-sm border border-admin-border bg-white p-3 shadow-lg",
                      index >= 4 ? "right-0" : "left-0",
                    )}
                  >
                    <p className="text-admin-body-sm font-medium text-admin-text">
                      {d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="text-admin-caption text-admin-text-secondary">
                        From
                        <input
                          type="time"
                          value={chosen.startTime}
                          onChange={(e) => setTime(date, "startTime", e.target.value)}
                          className="mt-0.5 block w-full rounded-admin-sm border border-admin-border px-2 py-1.5 text-admin-body-sm text-admin-text"
                        />
                      </label>
                      <label className="text-admin-caption text-admin-text-secondary">
                        To
                        <input
                          type="time"
                          value={chosen.endTime}
                          onChange={(e) => setTime(date, "endTime", e.target.value)}
                          className="mt-0.5 block w-full rounded-admin-sm border border-admin-border px-2 py-1.5 text-admin-body-sm text-admin-text"
                        />
                      </label>
                    </div>
                    {chosen.startTime >= chosen.endTime && (
                      <p className="mt-2 text-admin-caption text-admin-danger">The end time must be after the start time.</p>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <button type="button" onClick={() => removeDay(date)} className="text-admin-caption text-admin-danger hover:underline">
                        Remove day
                      </button>
                      <button type="button" onClick={() => setOpenDay(null)} className="text-admin-caption font-medium text-admin-sidebar-cta hover:underline">
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reserves room so the open time box doesn't cover the save row. */}
      <div className={cn("mt-4 flex items-center justify-between gap-3 border-t border-admin-border pt-4", openDay && "mt-28")}>
        <p className={cn("text-admin-body-sm", selectedCount >= MIN_AVAILABLE_DAYS ? "text-admin-text-secondary" : "text-admin-danger")}>
          {selectedCount} of {MIN_AVAILABLE_DAYS} minimum days selected
        </p>
        <Button onClick={save} loading={saving} disabled={!canSave || loading} size="sm" className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
          Save availability
        </Button>
      </div>
      {message && (
        <p role="status" className={cn("mt-2 text-admin-body-sm", message.kind === "success" ? "text-admin-text-secondary" : "text-admin-danger")}>
          {message.text}
        </p>
      )}
    </Card>
  );
}
