import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Card } from "./ui/Card";
import { Toggle } from "./ui/Toggle";
import { currentSubscription, disablePush, enablePush } from "../lib/push";
import { usePushState } from "../lib/NotificationBridge";

// Per-device switch for push alerts, shared by every role's settings page. Turning on triggers the browser's own
// permission prompt; turning off removes only this device.
export function DeviceNotificationsCard() {
  const { permission, refresh } = usePushState();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void currentSubscription().then((s) => setOn(Boolean(s) && permission === "granted"));
  }, [permission]);

  async function change(next: boolean) {
    setBusy(true); setNote(null);
    try {
      if (next) {
        const result = await enablePush();
        setOn(result === "enabled");
        if (result === "denied") setNote("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
        if (result === "unavailable") setNote("This browser or server isn't set up for push notifications.");
      } else {
        await disablePush();
        setOn(false);
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That didn't work");
    } finally { setBusy(false); refresh(); }
  }

  const unsupported = permission === "unsupported";
  return (
    <Card className="border-admin-border p-5">
      <h2 className="flex items-center gap-2 text-admin-h4 text-admin-text">
        <Bell className="size-4 text-admin-text-secondary" aria-hidden="true" /> Device notifications
      </h2>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-admin-body-sm text-admin-text">Alerts on this device, even when OncoFlow is closed</p>
          <p className="text-admin-caption text-admin-text-secondary">Alerts are generic and never show patient details. They continue after you sign out until you turn this off. If you have no active session you'll also get an email.</p>
        </div>
        <Toggle checked={on} onChange={(v) => void change(v)} disabled={busy || unsupported} label="Device notifications" />
      </div>
      {unsupported && <p className="mt-2 text-admin-caption text-admin-text-secondary">This browser doesn't support push notifications.</p>}
      {note && <p role="alert" className="mt-2 text-admin-caption text-admin-danger">{note}</p>}
    </Card>
  );
}
