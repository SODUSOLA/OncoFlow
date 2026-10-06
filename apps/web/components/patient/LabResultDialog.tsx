"use client";

import { useEffect, useState } from "react";
import { FileText, ExternalLink, Download } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import type { LabResult } from "@/lib/types";

const STATUS_VARIANT: Record<LabResult["status"], "default" | "success" | "warning"> = {
  PENDING: "default",
  UPLOADED: "warning",
  REVIEWED: "success",
};

const STATUS_NOTE: Record<LabResult["status"], string> = {
  PENDING: "Waiting for your file.",
  UPLOADED: "Submitted and awaiting review by your care team.",
  REVIEWED: "Reviewed by your care team.",
};

const dateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-900">{value}</span>
    </div>
  );
}

// What was uploaded for one lab result: dates, review status, the file itself (once it has passed the virus scan)
// and a link to open or save it.
export function LabResultDialog({ result, onClose }: { result: LabResult | null; onClose: () => void }) {
  const [mimeType, setMimeType] = useState<string | null>(null);

  useEffect(() => {
    setMimeType(null);
    if (!result || result.fileStatus === "INFECTED") return;
    let cancelled = false;
    api.get<{ file: { mimeType: string } }>(`/files/${result.fileId}`)
      .then((d) => { if (!cancelled) setMimeType(d.file.mimeType); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [result]);

  const openable = result?.fileStatus === "CLEAN";

  return (
    <Dialog open={!!result} onClose={onClose} title="Lab result">
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-semibold text-neutral-500">RESULT {result.id.slice(0, 8).toUpperCase()}</p>
            <Badge variant={STATUS_VARIANT[result.status]}>{result.status}</Badge>
          </div>
          <p className="text-sm text-neutral-600">{STATUS_NOTE[result.status]}</p>

          <div className="rounded-xl bg-patient-bg px-4 py-2">
            <Row label="Test date" value={new Date(result.testDate).toLocaleDateString(undefined, { dateStyle: "medium" })} />
            <Row label="Uploaded" value={dateTime(result.createdAt)} />
            <Row label="Review" value={result.reviewedBy ? "Reviewed by your care team" : "Not yet reviewed"} />
            {mimeType && <Row label="File type" value={mimeType} />}
          </div>

          {result.possibleDuplicate && (
            <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning">
              This looks like a file you have already uploaded, so your care team has been asked to check it.
            </p>
          )}

          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="flex items-center gap-3">
              <FileText className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-900">Your uploaded file</p>
                <p className="text-xs text-neutral-500">
                  {result.fileStatus === "CLEAN" && "Scanned and safe to open."}
                  {result.fileStatus === "PENDING" && "Security scan in progress — it can be opened once the scan finishes."}
                  {result.fileStatus === "INFECTED" && "Blocked: this file was flagged during the virus scan and is pending review."}
                </p>
              </div>
            </div>
            {openable && (
              <div className="mt-3 flex gap-2">
                <a
                  href={`/api/files/${result.fileId}/content`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold text-primary hover:border-primary"
                >
                  <ExternalLink className="size-4" aria-hidden="true" /> Open
                </a>
                <a
                  href={`/api/files/${result.fileId}/content?download=true`}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold text-primary hover:border-primary"
                >
                  <Download className="size-4" aria-hidden="true" /> Download
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
