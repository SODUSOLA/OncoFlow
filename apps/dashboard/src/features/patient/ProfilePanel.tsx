import { useState } from "react";
import { api } from "../../lib/api";
import type { Patient } from "../../lib/types";

// Non-clinical, self-editable fields only — the backend enforces this same restriction
// server-side (SELF_EDITABLE_FIELDS in patient/controller.ts), this just mirrors it in the UI
// so a patient isn't shown inputs for fields their own edit can never actually change.
export function ProfilePanel({ patient, onUpdated }: { patient: Patient; onUpdated: () => void }) {
  const [phone, setPhone] = useState(patient.phone ?? "");
  const [secondaryEmail, setSecondaryEmail] = useState(patient.secondaryEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleSave() {
    setSaving(true);
    setResult(null);
    try {
      await api.put<{ patient: Patient }>(`/patients/${patient.id}`, { phone, secondaryEmail });
      onUpdated();
      setResult("Profile updated");
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function handlePictureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const content = await fileToBase64(file);
      const uploadRes = await api.post<{ file: { id: string } }>("/files/upload", {
        patientId: patient.id, mimeType: file.type, content,
      });
      await api.put<{ patient: Patient }>(`/patients/${patient.id}`, {
        profilePictureFileId: uploadRes.file.id,
      });
      onUpdated();
      setResult("Profile picture updated");
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">My Profile</h2>

      <div className="bg-white rounded-xl border border-gray-200 p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-sm text-gray-500 mb-1">Unique Patient ID</p>
          <p className="font-mono text-gray-800">{patient.uniquePatientId}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500 mb-1">Name</p>
          <p className="text-gray-800">{patient.firstName} {patient.lastName}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500 mb-1">Date of Birth</p>
          <p className="text-gray-800">{new Date(patient.dob).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500 mb-1">Gender</p>
          <p className="text-gray-800">{patient.gender}</p>
        </div>
        <p className="md:col-span-2 text-xs text-gray-400">
          Name, date of birth, and gender are clinical-identity fields — contact your care team to correct these.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-700">Contact Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Secondary Email</label>
            <input
              type="email"
              value={secondaryEmail}
              onChange={(e) => setSecondaryEmail(e.target.value)}
              placeholder="Optional"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm font-medium"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <h3 className="font-semibold text-gray-700">Profile Picture</h3>
        <p className="text-sm text-gray-500">
          {patient.profilePictureFileId ? `Uploaded (file ${patient.profilePictureFileId.slice(0, 8)}...)` : "No picture uploaded yet"}
        </p>
        <input type="file" accept="image/*" onChange={handlePictureUpload} disabled={uploading} className="text-sm" />
      </div>

      {result && (
        <p className={`text-sm ${result.includes("failed") || result.includes("Failed") ? "text-red-600" : "text-green-600"}`}>
          {result}
        </p>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
