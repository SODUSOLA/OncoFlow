"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, Fingerprint, ShieldCheck, CreditCard, Monitor, Smartphone, LogOut } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import type { AuthSession } from "@/lib/types";
import { invalidateMyPatient } from "@/lib/useMyPatient";

// Disabled settings row for a feature that isn't built yet.
function ComingSoonRow({ icon: Icon, label, description }: { icon: typeof Bell; label: string; description: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
        <Icon className="size-4.5" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-neutral-700">{label}</p>
        <p className="text-xs text-neutral-400">{description}</p>
      </div>
      <Badge variant="sample">Coming soon</Badge>
    </div>
  );
}

// One active session row with a revoke button.
function SessionRow({ session, onRevoke }: { session: AuthSession; onRevoke: (id: string) => void }) {
  const [revoking, setRevoking] = useState(false);
  const Icon = /mobile|iphone|android/i.test(session.device) ? Smartphone : Monitor;

  // Revokes the session.
  async function handleRevoke() {
    setRevoking(true);
    try {
      await api.post(`/auth/sessions/${session.id}/revoke`);
      onRevoke(session.id);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
        <Icon className="size-4.5" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-neutral-700">
          {session.device || "Unknown device"} {session.isCurrent && <span className="text-teal">(this device)</span>}
        </p>
        <p className="text-xs text-neutral-400">
          {session.ip} · {new Date(session.createdAt).toLocaleDateString()}
        </p>
      </div>
      {!session.isCurrent && (
        <Button variant="outline" size="sm" onClick={handleRevoke} loading={revoking}>
          Revoke
        </Button>
      )}
    </div>
  );
}

// Settings page with sessions and sign out.
export default function SettingsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ sessions: AuthSession[] }>("/auth/sessions");
      setSessions(res.sessions);
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  // Removes a revoked session from the list.
  function handleRevoked(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  // Signs the patient out and returns to login.
  async function handleSignOut() {
    await api.post("/auth/logout").catch(() => {
      /* clear the client-visible session regardless of whether the API call succeeded */
    });
    // Clears the module-level patient cache so the next account on this tab doesn't briefly see the previous patient's data.
    invalidateMyPatient();
    router.push("/login");
  }

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="size-5 text-neutral-500" />
        </button>
        <h1 className="text-lg font-bold text-neutral-900">Settings</h1>
      </div>

      <Card className="divide-y divide-neutral-100 py-0">
        <ComingSoonRow icon={Bell} label="Notifications" description="Appointment and billing alerts" />
        <ComingSoonRow icon={Fingerprint} label="Biometric Login" description="Sign in with Face ID / Touch ID" />
        <ComingSoonRow icon={ShieldCheck} label="Multi-Factor Authentication" description="Extra verification at sign-in" />
        <ComingSoonRow icon={CreditCard} label="Payment Methods" description="Manage saved payment methods" />
      </Card>

      <div>
        <h2 className="mb-3 text-base font-bold text-neutral-900">Active Sessions</h2>
        <Card className="divide-y divide-neutral-100 py-0">
          {loading ? (
            <p className="py-6 text-center text-sm text-neutral-400">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-400">No active sessions</p>
          ) : (
            sessions.map((s) => <SessionRow key={s.id} session={s} onRevoke={handleRevoked} />)
          )}
        </Card>
      </div>

      <Button variant="outline" className="w-full text-critical" onClick={handleSignOut}>
        <LogOut className="size-4" aria-hidden="true" /> Sign Out
      </Button>
    </div>
  );
}
