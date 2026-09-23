import { ShieldCheck, Wifi, WifiOff, Clock3 } from "lucide-react";
import type { DailyCallStatus } from "./useDailyCall";

// Formats seconds as mm:ss.
function formatDuration(sec: number): string {
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// Connection and encryption badges plus a call timer; "Encrypted" reflects Daily's baseline only and makes no HIPAA/BAA claim.
export function VideoHUD({ status, durationSec }: { status: DailyCallStatus; durationSec: number }) {
  const connected = status === "joined";
  return (
    <div className="absolute left-4 top-4 flex items-center gap-2">
      <span className={`flex items-center gap-1.5 rounded-admin-sm px-2.5 py-1 text-admin-caption font-medium text-white ${connected ? "bg-admin-success/80" : "bg-black/50"}`}>
        {connected ? <Wifi className="size-3.5" aria-hidden="true" /> : <WifiOff className="size-3.5" aria-hidden="true" />}
        {connected ? "Connected" : status === "joining" ? "Connecting…" : status === "error" ? "Connection failed" : "Not connected"}
      </span>
      <span className="flex items-center gap-1.5 rounded-admin-sm bg-black/50 px-2.5 py-1 text-admin-caption text-white">
        <ShieldCheck className="size-3.5" aria-hidden="true" /> Encrypted
      </span>
      {connected && (
        <span className="flex items-center gap-1.5 rounded-admin-sm bg-black/50 px-2.5 py-1 text-admin-caption text-white">
          <Clock3 className="size-3.5" aria-hidden="true" /> {formatDuration(durationSec)}
        </span>
      )}
    </div>
  );
}
