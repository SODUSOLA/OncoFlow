"use client";

import { useEffect, useRef } from "react";
import { UserRound } from "lucide-react";
import type { RemoteParticipantView } from "@/lib/useDailyCall";

// Full-bleed remote tile; attaching the daily-js track to the <video> element is manual in Call Object mode
// and happens only here. Mirrors the dashboard's consultant version, on the patient app's own color tokens.
export function RemoteVideoTile({ participant }: { participant: RemoteParticipantView | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = participant?.videoTrack ? new MediaStream([participant.videoTrack]) : null;
  }, [participant?.videoTrack]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-neutral-900">
      {participant?.videoTrack ? (
        <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-2 px-6 text-center text-white/60">
          <div className="flex size-16 items-center justify-center rounded-full bg-white/10">
            <UserRound className="size-7" aria-hidden="true" />
          </div>
          <p className="text-sm">
            {participant ? `${participant.userName} — camera off` : "Waiting for your care team to join…"}
          </p>
        </div>
      )}
      {participant && (
        <span className="absolute bottom-4 left-4 rounded-lg bg-black/50 px-2.5 py-1 text-xs text-white">
          {participant.userName}
        </span>
      )}
    </div>
  );
}
