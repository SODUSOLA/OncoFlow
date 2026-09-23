import { useEffect, useRef } from "react";
import { UserRound } from "lucide-react";
import type { RemoteParticipantView } from "./useDailyCall";

// Full-bleed remote tile; attaching the daily-js track to the <video> element is manual in Call Object mode and happens only here.
export function RemoteVideoTile({ participant }: { participant: RemoteParticipantView | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (participant?.videoTrack) {
      el.srcObject = new MediaStream([participant.videoTrack]);
    } else {
      el.srcObject = null;
    }
  }, [participant?.videoTrack]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-admin-lg bg-[#0B1220]">
      {participant?.videoTrack ? (
        <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-2 text-white/60">
          <div className="flex size-20 items-center justify-center rounded-full bg-white/10">
            <UserRound className="size-9" aria-hidden="true" />
          </div>
          <p className="text-admin-body-sm">
            {participant ? `${participant.userName} — camera off` : "Waiting for participant video…"}
          </p>
        </div>
      )}
      {participant && (
        <span className="absolute bottom-4 left-4 rounded-admin-sm bg-black/50 px-2.5 py-1 text-admin-caption text-white">
          {participant.userName}
        </span>
      )}
    </div>
  );
}
