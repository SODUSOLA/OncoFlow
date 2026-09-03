"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings, Camera, IdCard, Pencil, MapPin, Users, Hospital } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input } from "@/components/ui/Field";
import { api } from "@/lib/api";
import {
  useMyPatient,
  type PatientAddress,
  type PatientEmergencyContact,
  type PatientFacility,
} from "@/lib/useMyPatient";
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
  const { patient, facility, addresses, emergencyContacts, loading, notLinked, reload } = useMyPatient();

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

  return (
    <ProfileForm
      patient={patient}
      facility={facility}
      addresses={addresses}
      emergencyContacts={emergencyContacts}
      onUpdated={reload}
    />
  );
}

function ProfileForm({
  patient, facility, addresses, emergencyContacts, onUpdated,
}: {
  patient: Patient;
  facility: PatientFacility | null;
  addresses: PatientAddress[];
  emergencyContacts: PatientEmergencyContact[];
  onUpdated: () => void;
}) {
  const [phone, setPhone] = useState(patient.phone ?? "");
  const [secondaryEmail, setSecondaryEmail] = useState(patient.secondaryEmail ?? "");
  // Contact details are read-only until Edit is pressed. Rendering live inputs by default made
  // the card look like a form waiting to be filled in, and put a patient one stray keystroke
  // away from changing the number their care team uses to reach them.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setResult(null);
    try {
      await api.put(`/patients/${patient.id}`, { phone, secondaryEmail });
      onUpdated();
      setEditing(false);
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
            <p className="text-xs text-neutral-500">Biological Sex</p>
            <p className="text-sm text-neutral-900">{patient.gender}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-neutral-500">Account Email</p>
            <p className="truncate text-sm text-neutral-900">{patient.email}</p>
          </div>
        </div>
        <p className="text-xs text-neutral-400">
          Name, date of birth, and gender are clinical-identity fields — contact your care team to
          correct these.
        </p>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Contact Details</h2>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Pencil className="size-3.5" aria-hidden="true" /> Edit
            </button>
          )}
        </div>

        {editing ? (
          <>
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
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  // Discard edits rather than leaving them staged — reopening Edit should show
                  // what is actually saved, not what was abandoned last time.
                  setPhone(patient.phone ?? "");
                  setSecondaryEmail(patient.secondaryEmail ?? "");
                  setEditing(false);
                  setResult(null);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSave} loading={saving}>
                Save Changes
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-neutral-500">Phone Number</p>
              <p className="text-sm text-neutral-900">{patient.phone || "Not provided"}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Secondary Email</p>
              <p className="text-sm text-neutral-900">{patient.secondaryEmail || "Not provided"}</p>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <Hospital className="size-4" aria-hidden="true" /> Care Facility
        </h2>
        {facility ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-neutral-500">Treating Facility</p>
              <p className="text-sm text-neutral-900">{facility.name}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Region</p>
              <p className="text-sm text-neutral-900">{facility.region}</p>
            </div>
            {/* facilityConfirmedAt is null until a Regional Admin confirms the choice made at
                registration — the record is fully usable meanwhile, so this is status, not a
                warning. */}
            <div>
              <p className="text-xs text-neutral-500">Status</p>
              <p className="text-sm text-neutral-900">
                {patient.facilityConfirmedAt ? "Confirmed by your care team" : "Awaiting care team confirmation"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No facility on record yet.</p>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <MapPin className="size-4" aria-hidden="true" /> Address
        </h2>
        {addresses.length === 0 ? (
          <p className="text-sm text-neutral-400">No address on record. Your care team can add one for you.</p>
        ) : (
          <ul className="space-y-3">
            {addresses.map((a) => (
              <li key={a.id} className="text-sm text-neutral-900">
                {a.address}
                <span className="block text-xs text-neutral-500">{[a.city, a.state, a.country].filter(Boolean).join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <Users className="size-4" aria-hidden="true" /> Emergency Contacts
        </h2>
        {emergencyContacts.length === 0 ? (
          <p className="text-sm text-neutral-400">
            No emergency contact on record. Your care team can add one for you.
          </p>
        ) : (
          <ul className="space-y-3">
            {emergencyContacts.map((c) => (
              <li key={c.id}>
                <p className="text-sm text-neutral-900">{c.name}</p>
                <p className="text-xs text-neutral-500">{c.relationship} · {c.phone}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {result && (
        <p className={`text-sm ${result.toLowerCase().includes("failed") ? "text-critical" : "text-teal"}`}>
          {result}
        </p>
      )}
    </div>
  );
}
