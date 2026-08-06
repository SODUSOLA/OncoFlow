"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings, Camera, IdCard } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useMyPatient } from "@/lib/useMyPatient";
import type { Patient } from "@/lib/types";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Non-clinical, self-editable fields only — the backend enforces the same restriction
// server-side (SELF_EDITABLE_FIELDS in patient/controller.ts); this mirrors it so the UI
// doesn't show inputs for fields a patient's own edit can never actually change.
export default function ProfilePage() {
  const { patient, loading, notLinked, reload } = useMyPatient();

  if (loading) {
    return <p className="p-6 text-center text-sm text-neutral-400">Loading your profile…</p>;
  }

  if (notLinked || !patient) {
    return (
      <div className="p-6">
        <Card className="text-center text-sm text-neutral-600">
          Your profile becomes available once your care team confirms your patient record.
        </Card>
      </div>
    );
  }

  return <ProfileForm patient={patient} onUpdated={reload} />;
}

function ProfileForm({ patient, onUpdated }: { patient: Patient; onUpdated: () => void }) {
  const [phone, setPhone] = useState(patient.phone ?? "");
  const [secondaryEmail, setSecondaryEmail] = useState(patient.secondaryEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setResult(null);
    try {
      await api.put(`/patients/${patient.id}`, { phone, secondaryEmail });
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
        patientId: patient.id,
        mimeType: file.type,
        content,
      });
      await api.put(`/patients/${patient.id}`, { profilePictureFileId: uploadRes.file.id });
      onUpdated();
      setResult("Profile picture updated");
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const initials = `${patient.firstName[0] ?? ""}${patient.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-primary">My Profile</h1>
        <Link href="/settings" aria-label="Settings" className="text-neutral-400 hover:text-primary">
          <Settings className="size-5" aria-hidden="true" />
        </Link>
      </div>

      <Card className="flex flex-col items-center gap-2 text-center">
        <label className="group relative flex size-20 cursor-pointer items-center justify-center rounded-full bg-primary text-2xl font-bold text-accent">
          {initials}
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="size-5 text-white" aria-hidden="true" />
          </span>
          <input type="file" accept="image/*" onChange={handlePictureUpload} disabled={uploading} className="hidden" />
        </label>
        <p className="mt-1 text-lg font-bold text-neutral-900">{patient.firstName} {patient.lastName}</p>
        <p className="font-mono text-xs text-neutral-500">{patient.uniquePatientId}</p>
        {uploading && <p className="text-xs text-neutral-400">Uploading…</p>}
      </Card>

      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <IdCard className="size-4" aria-hidden="true" /> Identity
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-neutral-500">Date of Birth</p>
            <p className="text-sm text-neutral-900">{new Date(patient.dob).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Gender</p>
            <p className="text-sm text-neutral-900">{patient.gender}</p>
          </div>
        </div>
        <p className="text-xs text-neutral-400">
          Name, date of birth, and gender are clinical-identity fields — contact your care team to
          correct these.
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-neutral-700">Contact Details</h2>
        <FieldWrapper label="Phone Number" htmlFor="phone">
          <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Secondary Email" htmlFor="secondaryEmail">
          <Input
            id="secondaryEmail"
            type="email"
            value={secondaryEmail}
            onChange={(e) => setSecondaryEmail(e.target.value)}
            placeholder="Optional"
          />
        </FieldWrapper>
        <Button className="w-full" onClick={handleSave} loading={saving}>
          Save Changes
        </Button>
      </Card>

      {result && (
        <p className={`text-sm ${result.toLowerCase().includes("failed") ? "text-critical" : "text-teal"}`}>
          {result}
        </p>
      )}
    </div>
  );
}
