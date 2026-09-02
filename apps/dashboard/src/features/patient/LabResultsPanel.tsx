import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { LabRequest, LabResult } from "../../lib/types";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function UploadRow({ request, onUploaded }: { request: LabRequest; onUploaded: () => void }) {
  const [testDate, setTestDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !testDate) {
      setError("Pick a test date before choosing a file");
      e.target.value = "";
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const content = await fileToBase64(file);
      // fileHash comes back from the upload response — computed server-side, never
      // recomputed client-side (would need a matching algorithm for no real benefit).
      const uploadRes = await api.post<{ file: { id: string; fileHash: string } }>("/files/upload", {
        patientId: request.patientId, mimeType: file.type, content,
      });
      await api.post("/lab-results", {
        patientId: request.patientId, requestId: request.id,
        fileId: uploadRes.file.id, testDate, fileHash: uploadRes.file.fileHash,
      });
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <li className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-gray-800">Lab request — {new Date(request.createdAt).toLocaleDateString()}</p>
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{request.status}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={testDate}
          onChange={(e) => setTestDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        />
        <label className="px-3 py-1.5 bg-ink text-white rounded-lg hover:bg-ink-600 text-xs font-medium cursor-pointer">
          {uploading ? "Uploading..." : "Upload Result"}
          <input type="file" onChange={handleUpload} disabled={uploading} className="hidden" />
        </label>
      </div>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </li>
  );
}

export function LabResultsPanel({ patientId }: { patientId: string }) {
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [results, setResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [reqRes, resRes] = await Promise.all([
      api.get<{ labRequests: LabRequest[] }>(`/lab-requests?patientId=${patientId}`).catch(() => ({ labRequests: [] })),
      api.get<{ labResults: LabResult[] }>(`/lab-results?patientId=${patientId}`).catch(() => ({ labResults: [] })),
    ]);
    setRequests(reqRes.labRequests);
    setResults(resRes.labResults);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [patientId]);

  const pendingRequests = requests.filter((r) => r.status === "PENDING");

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Lab Results</h2>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-700">Awaiting Your Upload</h3>
            </div>
            {pendingRequests.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No pending lab requests</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {pendingRequests.map((r) => (
                  <UploadRow key={r.id} request={r} onUploaded={load} />
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-700">Uploaded Results</h3>
            </div>
            {results.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No lab results yet</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {results.map((r) => (
                  <li key={r.id} className="px-6 py-4 flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-800">Test date: {new Date(r.testDate).toLocaleDateString()}</span>
                    <div className="flex items-center gap-2">
                      {r.fileStatus !== "CLEAN" && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.fileStatus === "INFECTED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {r.fileStatus === "INFECTED" ? "Blocked: infected" : "Scan pending"}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === "REVIEWED" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                      }`}>{r.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
