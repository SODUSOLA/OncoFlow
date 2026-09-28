"use client";

import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";

// Call controls for microphone, camera and leaving the call.
export function ControlBar({
  audioOn, videoOn, onToggleAudio, onToggleVideo, onLeave,
}: {
  audioOn: boolean; videoOn: boolean; onToggleAudio: () => void; onToggleVideo: () => void; onLeave: () => void;
}) {
  return (
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-black/50 px-3 py-2.5 backdrop-blur sm:bottom-6 sm:gap-3 sm:px-4 sm:py-3">
      <button
        onClick={onToggleAudio}
        className={cn(
          "flex size-10 items-center justify-center rounded-full transition-colors sm:size-11",
          audioOn ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-critical",
        )}
        aria-label={audioOn ? "Mute microphone" : "Unmute microphone"}
      >
        {audioOn ? <Mic className="size-5" aria-hidden="true" /> : <MicOff className="size-5" aria-hidden="true" />}
      </button>
      <button
        onClick={onToggleVideo}
        className={cn(
          "flex size-10 items-center justify-center rounded-full transition-colors sm:size-11",
          videoOn ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-critical",
        )}
        aria-label={videoOn ? "Turn camera off" : "Turn camera on"}
      >
        {videoOn ? <Video className="size-5" aria-hidden="true" /> : <VideoOff className="size-5" aria-hidden="true" />}
      </button>
      <div className="mx-0.5 h-7 w-px bg-white/20 sm:mx-1 sm:h-8" />
      <button
        onClick={onLeave}
        className="flex h-10 items-center gap-2 rounded-full bg-critical px-4 text-sm font-semibold text-white hover:opacity-90 sm:h-11 sm:px-5"
      >
        <PhoneOff className="size-4" aria-hidden="true" /> Leave
      </button>
    </div>
  );
}
