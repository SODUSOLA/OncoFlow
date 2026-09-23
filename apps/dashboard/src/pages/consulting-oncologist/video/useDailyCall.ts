import { useCallback, useEffect, useRef, useState } from "react";
import Daily from "@daily-co/daily-js";

export interface RemoteParticipantView {
  sessionId: string;
  userName: string;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
}

export type DailyCallStatus = "idle" | "joining" | "joined" | "left" | "error";

export interface UseDailyCallResult {
  status: DailyCallStatus;
  error: string | null;
  localAudioOn: boolean;
  localVideoOn: boolean;
  localVideoTrack: MediaStreamTrack | null;
  remoteParticipants: RemoteParticipantView[];
  toggleAudio: () => void;
  toggleVideo: () => void;
  leave: () => void;
  durationSec: number;
}

// Thin wrapper over the real daily-js Call Object; nothing is simulated, and without Daily configured the status settles on "error" with Daily's message.
export function useDailyCall(roomUrl: string | null, token: string | null, userName: string): UseDailyCallResult {
  const callRef = useRef<ReturnType<typeof Daily.createCallObject> | null>(null);
  const [status, setStatus] = useState<DailyCallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [localAudioOn, setLocalAudioOn] = useState(true);
  const [localVideoOn, setLocalVideoOn] = useState(true);
  const [localVideoTrack, setLocalVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipantView[]>([]);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  const [durationSec, setDurationSec] = useState(0);

  useEffect(() => {
    if (!roomUrl || !token) return;
    const call = Daily.createCallObject();
    callRef.current = call;
    setStatus("joining");
    setError(null);

    // Copies the call object's participants into React state.
    function syncParticipants() {
      const all = call.participants();
      const remotes: RemoteParticipantView[] = [];
      for (const key of Object.keys(all)) {
        const p = all[key];
        if (!p) continue;
        if (p.local) {
          setLocalAudioOn(p.tracks.audio.state === "playable" || p.tracks.audio.state === "sendable");
          setLocalVideoOn(p.tracks.video.state === "playable" || p.tracks.video.state === "sendable");
          setLocalVideoTrack(p.tracks.video.state === "playable" ? p.tracks.video.persistentTrack ?? null : null);
        } else {
          remotes.push({
            sessionId: p.session_id,
            userName: p.user_name || "Patient",
            videoTrack: p.tracks.video.state === "playable" ? p.tracks.video.persistentTrack ?? null : null,
            audioTrack: p.tracks.audio.state === "playable" ? p.tracks.audio.persistentTrack ?? null : null,
          });
        }
      }
      setRemoteParticipants(remotes);
    }

    call.on("joined-meeting", () => { setStatus("joined"); setJoinedAt(Date.now()); syncParticipants(); });
    call.on("participant-joined", syncParticipants);
    call.on("participant-updated", syncParticipants);
    call.on("participant-left", syncParticipants);
    call.on("left-meeting", () => setStatus("left"));
    call.on("error", (ev) => { setStatus("error"); setError(ev.errorMsg || "Call error"); });

    call.join({ url: roomUrl, token, userName }).catch((err: unknown) => {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to join call");
    });

    return () => {
      call.destroy().catch(() => {});
      callRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomUrl, token]);

  useEffect(() => {
    if (!joinedAt) return;
    const interval = setInterval(() => setDurationSec(Math.floor((Date.now() - joinedAt) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [joinedAt]);

  const toggleAudio = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !localAudioOn;
    call.setLocalAudio(next);
    setLocalAudioOn(next);
  }, [localAudioOn]);

  const toggleVideo = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !localVideoOn;
    call.setLocalVideo(next);
    setLocalVideoOn(next);
  }, [localVideoOn]);

  const leave = useCallback(() => {
    callRef.current?.leave().catch(() => {});
  }, []);

  return { status, error, localAudioOn, localVideoOn, localVideoTrack, remoteParticipants, toggleAudio, toggleVideo, leave, durationSec };
}
