"use client";

import { useEffect, useRef } from "react";
import { VideoOff } from "lucide-react";

// Floating self-view.
export function LocalVideoPiP({ videoTrack }: { videoTrack: MediaStreamTrack | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = videoTrack ? new MediaStream([videoTrack]) : null;
  }, [videoTrack]);

  return (
    <div className="absolute bottom-24 right-4 flex h-24 w-16 items-center justify-center overflow-hidden rounded-xl border-2 border-white/20 bg-neutral-900 shadow-lg sm:bottom-6 sm:right-6 sm:h-32 sm:w-48">
      {videoTrack ? (
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      ) : (
        <VideoOff className="size-5 text-white/50" aria-hidden="true" />
      )}
      <span className="absolute bottom-1 right-1.5 text-[10px] text-white/70">You</span>
    </div>
  );
}
