import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { cn } from "../../../lib/utils";

// Call controls for microphone, camera and ending the call.
export function ControlBar({
  audioOn, videoOn, onToggleAudio, onToggleVideo, onEndCall,
}: {
  audioOn: boolean; videoOn: boolean; onToggleAudio: () => void; onToggleVideo: () => void; onEndCall: () => void;
}) {
  return (
    <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-admin-lg bg-black/50 px-4 py-3 backdrop-blur">
      <button
        onClick={onToggleAudio}
        className={cn(
          "flex size-11 items-center justify-center rounded-full transition-colors",
          audioOn ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-admin-danger",
        )}
        title={audioOn ? "Mute microphone" : "Unmute microphone"}
      >
        {audioOn ? <Mic className="size-5" aria-hidden="true" /> : <MicOff className="size-5" aria-hidden="true" />}
      </button>
      <button
        onClick={onToggleVideo}
        className={cn(
          "flex size-11 items-center justify-center rounded-full transition-colors",
          videoOn ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-admin-danger",
        )}
        title={videoOn ? "Turn camera off" : "Turn camera on"}
      >
        {videoOn ? <Video className="size-5" aria-hidden="true" /> : <VideoOff className="size-5" aria-hidden="true" />}
      </button>
      <div className="mx-1 h-8 w-px bg-white/20" />
      <button
        onClick={onEndCall}
        className="flex h-11 items-center gap-2 rounded-full bg-admin-danger px-5 text-admin-body-sm font-semibold text-white hover:bg-admin-danger/90"
      >
        <PhoneOff className="size-4" aria-hidden="true" /> End Call
      </button>
    </div>
  );
}
