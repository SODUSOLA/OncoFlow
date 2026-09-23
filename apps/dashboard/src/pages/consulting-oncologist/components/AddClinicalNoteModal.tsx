import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "../../../components/ui/Button";

interface AddClinicalNoteModalProps {
  patientName: string;
  onClose: () => void;
  onSubmit: (note: string) => Promise<void>;
}

// Backs the sidebar's Add Clinical Note action (POST /clinical-notes) as a plain modal, since the mockups never open one.
export function AddClinicalNoteModal({ patientName, onClose, onSubmit }: AddClinicalNoteModalProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Submits the typed note and closes the modal.
  async function handleSubmit() {
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(note.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-admin-md border border-admin-border bg-white shadow-admin-card">
        <div className="flex items-center justify-between border-b border-admin-border px-6 py-4">
          <div>
            <p className="text-admin-h4 text-admin-text">Add Clinical Note</p>
            <p className="text-admin-caption text-admin-text-secondary">{patientName}</p>
          </div>
          <button onClick={onClose} className="rounded-admin-sm p-1.5 text-admin-text-secondary hover:bg-admin-card-alt">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-3 px-6 py-5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={6}
            autoFocus
            placeholder="Document findings, plan, or observations..."
            className="w-full rounded-admin-sm border border-admin-border p-3 text-admin-body-sm text-admin-text placeholder:text-admin-text-secondary focus:outline-none focus:ring-1 focus:ring-admin-sidebar-cta"
          />
          {error && <p className="text-admin-body-sm text-admin-danger">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-admin-border px-6 py-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            loading={saving}
            disabled={!note.trim()}
            className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90"
          >
            Save Note
          </Button>
        </div>
      </div>
    </div>
  );
}
