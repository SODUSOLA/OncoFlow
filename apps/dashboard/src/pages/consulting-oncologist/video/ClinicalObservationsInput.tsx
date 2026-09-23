import { useState } from "react";
import { ClipboardList, Check } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";

// Free-text observations that save to the patient's record via POST /clinical-notes, independent of transcription or an active call.
export function ClinicalObservationsInput({ patientId }: { patientId: string }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  // Saves the observation as a clinical note.
  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/clinical-notes", { patientId, note: text.trim() });
      setText("");
      setSavedCount((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save observation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-admin-border p-4">
      <p className="flex items-center gap-1.5 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">
        <ClipboardList className="size-3.5" aria-hidden="true" /> Clinical Observations
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Note observations during the consult — saved directly to the patient's clinical record."
        rows={3}
        className="mt-2 w-full resize-none rounded-admin-sm border border-admin-border p-2.5 text-admin-body-sm text-admin-text focus:outline-none focus:ring-1 focus:ring-admin-sidebar-cta"
      />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-admin-caption text-admin-text-secondary">
          {savedCount > 0 && (
            <span className="flex items-center gap-1 text-admin-success"><Check className="size-3.5" aria-hidden="true" /> {savedCount} saved this call</span>
          )}
        </p>
        <button
          onClick={save}
          disabled={saving || !text.trim()}
          className="rounded-admin-xs bg-admin-sidebar-cta px-4 py-1.5 text-admin-body-sm text-white hover:bg-admin-sidebar-cta/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Observation"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-admin-caption text-admin-danger">{error}</p>}
    </Card>
  );
}
