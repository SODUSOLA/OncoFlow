import { useEffect, useRef } from "react";
import { VideoOff, Circle } from "lucide-react";

// Floating self-view; recording is always false today since no recording integration exists, and the prop avoids touching this later.
export function LocalVideoPiP({ videoTrack, recording = false }: { videoTrack: MediaStreamTrack | null; recording?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = videoTrack ? new MediaStream([videoTrack]) : null;
  }, [videoTrack]);

  return (
    <div className="absolute bottom-6 right-6 flex h-32 w-48 items-center justify-center overflow-hidden rounded-admin-lg border-2 border-white/20 bg-[#0B1220] shadow-lg">
      {videoTrack ? (
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      ) : (
        <VideoOff className="size-6 text-white/50" aria-hidden="true" />
      )}
      {recording && (
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-admin-sm bg-black/60 px-1.5 py-0.5 text-admin-micro text-white">
          <Circle className="size-2 fill-red-500 text-red-500" aria-hidden="true" /> REC
        </span>
      )}
      <span className="absolute bottom-1.5 right-2 text-admin-micro text-white/70">You</span>
    </div>
  );
}
