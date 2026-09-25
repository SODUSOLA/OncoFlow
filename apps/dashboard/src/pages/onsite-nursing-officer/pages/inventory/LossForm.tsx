import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { api } from "../../../../lib/api";
import { Button } from "../../../../components/ui/Button";
import { INCIDENT_TYPE_LABEL, NEW_INCIDENT_TYPES, type Drug, type IncidentType } from "../../../../lib/drugSupply";
import { uploadFile, pollScanStatus } from "../../lib/uploadFile";
import { DrugPicker } from "./DrugPicker";

// Form to report a stock incident outside any case: what happened (type), how many, why, and a photo as
// evidence. Regional Admin and the State Director of Nursing Services see it.
export function LossForm({ drugs, onDone }: { drugs: Drug[]; onDone: () => void }) {
  const [drugId, setDrugId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [incidentType, setIncidentType] = useState<IncidentType>("BREAKAGE");
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Uploads the photo and waits for the safety scan, since the API only accepts a clean image.
  async function pickPhoto(file: File) {
    setUploading(true);
    setMessage(null);
    setPhoto(null);
    try {
      const uploaded = await uploadFile(file);
      const scanned = await pollScanStatus(uploaded.id);
      if (scanned.virusScanStatus !== "CLEAN") throw new Error("That photo was rejected by the safety scan — take another");
      setPhoto({ id: scanned.id, name: file.name });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not upload the photo");
    } finally {
      setUploading(false);
    }
  }

  // Records the incident, deducts stock and alerts Regional Admin and SDNS.
  async function submit() {
    if (!photo) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/drug-loss-reports", { drugId, quantity: Number(quantity), incidentType, reason: reason.trim(), photoFileId: photo.id });
      setQuantity("");
      setReason("");
      setPhoto(null);
      setMessage("Reported. Regional Admin and SDNS can now see it.");
      onDone();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not report the incident");
    } finally {
      setBusy(false);
    }
  }

  const ready = drugId && Number(quantity) > 0 && reason.trim().length >= 3 && !!photo;

  return (
    <div className="space-y-2">
      <DrugPicker drugs={drugs} value={drugId} onChange={setDrugId} />
      <div className="flex gap-2">
        <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Quantity" className="w-28 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm" />
        <select value={incidentType} onChange={(e) => setIncidentType(e.target.value as IncidentType)} aria-label="Incident type" className="flex-1 rounded-admin-sm border border-admin-border bg-white px-3 py-2 text-admin-body-sm">
          {NEW_INCIDENT_TYPES.map((t) => <option key={t} value={t}>{INCIDENT_TYPE_LABEL[t]}</option>)}
        </select>
      </div>
      <textarea
        value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000}
        placeholder="Reason — what happened (required)"
        className="w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
      />
      <input
        ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickPhoto(f); e.target.value = ""; }}
      />
      <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => fileInput.current?.click()} className="w-full rounded-admin-xs">
        <Camera className="size-3.5" aria-hidden="true" /> {photo ? "Photo attached — replace" : "Take or attach a photo (required)"}
      </Button>
      {photo && <p className="text-admin-micro text-admin-success">{photo.name} passed the safety scan.</p>}
      <Button onClick={submit} loading={busy} disabled={!ready} size="sm" className="w-full rounded-admin-xs bg-admin-danger hover:bg-admin-danger/90">Report incident</Button>
      {message && <p className="text-admin-micro text-admin-text-secondary">{message}</p>}
    </div>
  );
}
