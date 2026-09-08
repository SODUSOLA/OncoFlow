import { useEffect, useState } from "react";
import { FileText, MessageSquare } from "lucide-react";
import { api } from "../../../lib/api";
import { cn } from "../../../lib/utils";

// The build guide's Decision 3 (transcription/AI summary source) is explicitly OPEN in
// ONCOFLOW_CONSULTANT_BUILD_GUIDE.md — but this codebase already has a real answer at the data
// layer from an earlier sprint (F3.7/F3.11): Daily's native transcription webhook appends real
// utterances to the `transcript` table live during the call, a SCRIBE then corrects every
// segment, and the appointment's own consultant signs off — that sign-off, not raw transcription,
// is what F3.11 treats as "trusted". This panel is built against that real pipeline, polling the
// same GET /meetings/:meetingId/transcript endpoint the Scribe/sign-off screens use — it is not a
// placeholder. What's genuinely not built yet is the *second* job the guide describes: an LLM
// summarization pass over a finished, signed-off transcript — so Quick Summary stays an honest
// placeholder until that's decided, exactly as the guide asks.
export interface TranscriptEntry { speaker: string; timestamp: string; text: string }

const POLL_MS = 5000;

export function TranscriptPanel({ meetingId, live }: { meetingId: string; live: boolean }) {
  const [tab, setTab] = useState<"transcript" | "summary">("transcript");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.get<{ transcript: { speaker: string; content: string; createdAt: string }[] }>(
          `/meetings/${meetingId}/transcript`,
        );
        if (cancelled) return;
        setError(null);
        setEntries(res.transcript.map((t) => ({ speaker: t.speaker, timestamp: t.createdAt, text: t.content })));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load transcript");
      }
    }
    load();
    if (!live) return;
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [meetingId, live]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 border-b border-admin-border">
        <TabButton active={tab === "transcript"} onClick={() => setTab("transcript")} icon={MessageSquare} label="Live Transcript" />
        <TabButton active={tab === "summary"} onClick={() => setTab("summary")} icon={FileText} label="Quick Summary" />
      </div>

      {tab === "transcript" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? (
            <p className="text-admin-body-sm text-admin-danger">{error}</p>
          ) : entries.length === 0 ? (
            <p className="text-admin-body-sm text-admin-text-secondary">
              Transcription not yet connected for this call — entries appear here automatically once Daily's
              transcription starts streaming utterances.
            </p>
          ) : (
            <ul className="space-y-3">
              {entries.map((e, i) => (
                <li key={i}>
                  <p className="text-admin-micro font-semibold uppercase tracking-wide text-admin-text-secondary">
                    {e.speaker} · {new Date(e.timestamp).toLocaleTimeString()}
                  </p>
                  <p className="mt-0.5 text-admin-body-sm text-admin-text">{e.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="text-admin-body-sm text-admin-text-secondary">
            Quick Summary isn't available yet — it depends on an LLM summarization pass over a signed-off
            transcript, a pipeline this build hasn't wired up (ONCOFLOW_CONSULTANT_BUILD_GUIDE.md Decision 3
            is still open). This is a real "not built" state, not placeholder content.
          </p>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof FileText; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-admin-body-sm font-medium",
        active ? "border-admin-sidebar-cta text-admin-text" : "border-transparent text-admin-text-secondary hover:text-admin-text",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" /> {label}
    </button>
  );
}
