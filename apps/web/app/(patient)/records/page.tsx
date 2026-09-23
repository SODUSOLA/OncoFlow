"use client";

import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Upload, CircleCheck, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useMyPatient } from "@/lib/useMyPatient";
import type { LabRequest, LabResult } from "@/lib/types";

const RESULT_STATUS_VARIANT: Record<LabResult["status"], "default" | "success" | "warning"> = {
  PENDING: "default",
  UPLOADED: "warning",
  REVIEWED: "success",
};

// Reads a file as a base64 string.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Upload card for one lab request.
function UploadCard({ request, patientId, onDone }: { request: LabRequest; patientId: string; onDone: () => void }) {
  const [testDate, setTestDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Uploads the chosen file against the lab request.
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!testDate) {
      setError("Select the test date before choosing a file");
      e.target.value = "";
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const content = await fileToBase64(file);
      const uploadRes = await api.post<{ file: { id: string; fileHash: string } }>("/files/upload", {
        patientId, mimeType: file.type, content,
      });
      await api.post("/lab-results", {
        patientId, requestId: request.id,
        fileId: uploadRes.file.id, testDate, fileHash: uploadRes.file.fileHash,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <Card className="p-3.5">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="text-sm font-bold text-neutral-900">Pre-Treatment Laboratory Panel</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            Requested {new Date(request.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Badge variant="warning">PENDING</Badge>
      </div>
      <label className="mb-2 block text-xs font-semibold text-neutral-600" htmlFor={`test-date-${request.id}`}>
        Test date
      </label>
      <input
        id={`test-date-${request.id}`}
        type="date"
        value={testDate}
        onChange={(e) => setTestDate(e.target.value)}
        className="mb-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
      />
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 bg-patient-bg px-4 py-6 text-center hover:border-primary">
        <Upload className="size-5 text-neutral-400" aria-hidden="true" />
        <span className="text-sm font-semibold text-neutral-700">
          {uploading ? "Uploading…" : "Tap to choose a file"}
        </span>
        <input type="file" onChange={handleFile} disabled={uploading} className="hidden" />
      </label>
      {error && <p className="mt-2 text-xs text-critical">{error}</p>}
    </Card>
  );
}

// Records page with lab requests and results.
export default function RecordsPage() {
  const { patient, loading: patientLoading, notLinked } = useMyPatient();
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [results, setResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [justUploaded, setJustUploaded] = useState(false);

  const load = useCallback(async () => {
    if (!patient) return;
    const [reqRes, resRes] = await Promise.all([
      api.get<{ labRequests: LabRequest[] }>(`/lab-requests?patientId=${patient.id}`).catch(() => ({ labRequests: [] })),
      api.get<{ labResults: LabResult[] }>(`/lab-results?patientId=${patient.id}`).catch(() => ({ labResults: [] })),
    ]);
    setRequests(reqRes.labRequests);
    setResults(resRes.labResults);
  }, [patient]);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  if (patientLoading || loading) {
    return <p className="p-6 text-center text-sm text-neutral-400">Loading your records…</p>;
  }

  if (notLinked || !patient) {
    return (
      <div className="p-4">
        <Card className="text-center text-sm text-neutral-600">
          Your records become available once your care team confirms your patient record.
        </Card>
      </div>
    );
  }

  if (justUploaded) {
    return (
      <div className="space-y-4 p-4 text-center">
        <div className="mx-auto flex size-15 items-center justify-center rounded-xl bg-teal-bg text-teal">
          <CircleCheck className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-neutral-900">Upload Successful</h1>
        <p className="text-sm leading-relaxed text-neutral-500">
          Your lab results have been submitted and are now awaiting clinical review.
        </p>
        <Button className="w-full" onClick={() => setJustUploaded(false)}>
          Back to Records
        </Button>
      </div>
    );
  }

  const pendingRequests = requests.filter((r) => r.status === "PENDING");

  return (
    <div className="space-y-5 p-4">
      <h1 className="font-display text-xl font-bold text-primary">Records</h1>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-neutral-900">
          <FlaskConical className="size-4.5 text-primary" aria-hidden="true" />
          Awaiting Your Upload
        </h2>
        {pendingRequests.length === 0 ? (
          <Card className="text-center text-sm text-neutral-400">No pending lab requests</Card>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((r) => (
              <UploadCard
                key={r.id}
                request={r}
                patientId={patient.id}
                onDone={async () => {
                  await load();
                  setJustUploaded(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-base font-bold text-neutral-900">Lab Result History</h2>
        {results.length === 0 ? (
          <Card className="text-center text-sm text-neutral-400">No lab results yet</Card>
        ) : (
          <ul className="space-y-2.5">
            {results.map((r) => (
              <li key={r.id}>
                <Card className="flex items-center justify-between p-3.5">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      Test date: {new Date(r.testDate).toLocaleDateString()}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Uploaded {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                    {r.fileStatus === "PENDING" && (
                      <p className="mt-0.5 text-xs text-amber-600">Scan pending — not yet reviewable</p>
                    )}
                    {r.fileStatus === "INFECTED" && (
                      <p className="mt-0.5 text-xs text-red-600">Flagged during virus scan — blocked, pending review</p>
                    )}
                  </div>
                  <Badge variant={RESULT_STATUS_VARIANT[r.status]}>{r.status}</Badge>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
