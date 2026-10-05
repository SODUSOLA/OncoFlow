import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, Circle, ArrowLeft } from "lucide-react";
import { api } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { useInbox, SlaCountdown, fullName, type TriageState } from "../lib/vmo";

const BASE = "/dashboard/virtual-medical-officer";

// The mandatory Yes/No checklist. Answers are recorded one at a time, in order, on the server; completing the
// last one is what unlocks the patient folder (the server, not this page, enforces that).
export default function TriageChecklistPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { chats } = useInbox();
  const chat = chats?.find((c) => c.id === conversationId);
  const [state, setState] = useState<TriageState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.post<{ triage: TriageState }>(`/vmo/conversations/${conversationId}/triage`)
      .then((r) => setState(r.triage))
      .catch((e: Error) => setError(e.message));
  }, [conversationId]);

  useEffect(() => {
    if (state?.completed) navigate(`${BASE}/folder/${conversationId}`, { replace: true });
  }, [state?.completed, conversationId, navigate]);

  async function answer(questionId: string, value: boolean) {
    if (!state || busy) return;
    setBusy(true); setError(null);
    try {
      setState((await api.post<{ triage: TriageState }>(`/vmo/triage-sessions/${state.sessionId}/answers`, { questionId, answer: value })).triage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record that answer");
    } finally { setBusy(false); }
  }

  if (error && !state) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <p className="text-admin-danger">{error}</p>
        <button onClick={() => navigate(`${BASE}/inbox`)} className="mt-4 text-admin-body-sm text-admin-text underline">Back to inbox</button>
      </div>
    );
  }
  if (!state) return <p className="p-8 text-admin-text-secondary">Loading…</p>;

  if (state.total === 0) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <h1 className="text-admin-h3 text-admin-text">Triage isn't set up yet</h1>
        <p className="mt-2 text-admin-body-sm text-admin-text-secondary">No triage questions have been configured, so the patient folder can't be opened. Ask an administrator to add them.</p>
        <button onClick={() => navigate(`${BASE}/inbox/${conversationId}`)} className="mt-4 text-admin-body-sm text-admin-text underline">Back to the chat</button>
      </div>
    );
  }

  const current = state.questions.find((q) => q.answer === null) ?? null;
  const step = state.questions.findIndex((q) => q.id === current?.id) + 1;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-admin-border bg-white px-8 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`${BASE}/inbox/${conversationId}`)} className="text-admin-text-secondary hover:text-admin-text" aria-label="Back to chat">
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <p className="text-admin-body-sm font-semibold text-admin-text">{chat ? fullName(chat.patient) : "Patient"}</p>
            <p className="text-admin-caption text-admin-text-secondary">{chat ? `${chat.patient.uniquePatientId} · ${chat.patient.age} yrs` : ""}</p>
          </div>
        </div>
        {chat && (
          <div className="text-right">
            <p className="text-admin-caption uppercase tracking-wider text-admin-text-secondary">Response SLA</p>
            <SlaCountdown deadline={chat.slaDeadline} state={chat.slaState} className="text-admin-h3" />
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-admin-border bg-admin-card-alt p-6">
          <p className="mb-4 text-admin-caption font-semibold uppercase tracking-wider text-admin-text-secondary">Mandatory triage checklist</p>
          <ol className="space-y-3">
            {state.questions.map((q, i) => (
              <li key={q.id} className={cn("flex items-center gap-3 text-admin-body-sm", q.id === current?.id ? "font-bold text-admin-text" : "text-admin-text-secondary")}>
                {q.answer !== null ? <Check className="size-4 text-admin-success" /> : <Circle className="size-4" />}
                Question {i + 1}
              </li>
            ))}
          </ol>
          <p className="mt-6 text-admin-caption text-admin-text-secondary">{state.answered} of {state.total} answered</p>
        </aside>

        {current && (
          <section className="min-w-0 flex-1 overflow-y-auto p-10">
            <div className="mx-auto max-w-3xl space-y-6">
              <div>
                <p className="text-admin-caption font-semibold uppercase tracking-wider text-admin-text-secondary">Step {step} of {state.total}</p>
                <h1 className="mt-1 text-admin-h2 text-admin-text">{current.prompt}</h1>
              </div>
              <div className="rounded-admin-sm border-l-4 border-admin-warning bg-white p-4 shadow-admin-card">
                <p className="text-admin-caption font-semibold uppercase tracking-wider text-admin-warning">Clinical impact</p>
                <p className="mt-1 text-admin-body-sm text-admin-text">{current.impactContext}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button disabled={busy} onClick={() => answer(current.id, true)}
                  className="rounded-admin-md bg-admin-sidebar-cta px-6 py-6 text-admin-h4 text-white hover:bg-admin-sidebar-cta/90 disabled:opacity-50">
                  {current.affirmativeLabel}
                </button>
                <button disabled={busy} onClick={() => answer(current.id, false)}
                  className="rounded-admin-md border-2 border-admin-sidebar-cta bg-white px-6 py-6 text-admin-h4 text-admin-sidebar-cta hover:bg-admin-card-alt disabled:opacity-50">
                  {current.negativeLabel}
                </button>
              </div>
              {error && <p role="alert" className="text-admin-body-sm text-admin-danger">{error}</p>}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { title: "Protocol reference", body: current.protocolReference },
                  { title: "Differential diagnosis", body: current.differentialDiagnosis },
                  { title: "Required evidence", body: current.requiredEvidence },
                ].map((g) => (
                  <div key={g.title} className="rounded-admin-sm border border-admin-border bg-white p-4">
                    <p className="text-admin-caption font-semibold uppercase tracking-wider text-admin-text-secondary">{g.title}</p>
                    <p className="mt-2 text-admin-body-sm text-admin-text">{g.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
