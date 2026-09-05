import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? "oncoflow-uploads";
const R2_JURISDICTION = (process.env.R2_JURISDICTION ?? "").trim().toLowerCase();

// Cloudflare serves each R2 jurisdiction from its own endpoint host, and a bucket created in
// one jurisdiction is completely invisible from another: every request for it comes back as
// NoSuchBucket, which is indistinguishable from a misspelt bucket name. Building the endpoint
// from an explicit jurisdiction is what makes that difference configurable instead of a puzzle.
const R2_JURISDICTIONS = new Set(["", "eu", "fedramp"]);

function r2Endpoint(): string {
  if (!R2_JURISDICTIONS.has(R2_JURISDICTION)) {
    throw new Error(
      `Unsupported R2_JURISDICTION "${R2_JURISDICTION}". Use "eu", "fedramp", or leave it unset for the default jurisdiction.`,
    );
  }
  const host = R2_JURISDICTION ? `${R2_ACCOUNT_ID}.${R2_JURISDICTION}` : R2_ACCOUNT_ID;
  return `https://${host}.r2.cloudflarestorage.com`;
}

function createS3Client(): S3Client {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  }
  return new S3Client({
    region: "auto",
    endpoint: r2Endpoint(),
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = createS3Client();
  }
  return s3Client;
}

export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function buildStorageKey(patientId: string | null, mimeType: string, fileHash: string): string {
  const ext = mimeType.split("/").pop() ?? "bin";
  const prefix = patientId ? `patients/${patientId}` : "unattached";
  return `${prefix}/${fileHash.slice(0, 2)}/${fileHash.slice(2, 4)}/${fileHash}.${ext}`;
}

export async function uploadToR2(
  buffer: Buffer,
  storageKey: string,
  mimeType: string,
): Promise<void> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
    }),
  );
}

export async function downloadFromR2(storageKey: string): Promise<Buffer> {
  const client = getS3Client();
  const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: storageKey }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

// Per docs/build-plan/10-security-gates.md Gate 6: "Never a public R2 bucket. Every file
// access goes through a short-TTL signed URL, generated server-side after an object-level
// authorization check." Five minutes is long enough to actually fetch the object (including a
// slow connection) but short enough that a leaked or logged URL is worthless shortly after —
// the authorization check is what runs again on every request, not the URL's own secrecy.
//
// getSignedUrl computes the signature locally from the client's own credentials; it makes no
// request to R2 itself, so calling this before an authorization decision is settled costs a
// few CPU cycles, not a network round trip or a real access to the object.
const SIGNED_URL_TTL_SECONDS = 300;

export async function getSignedDownloadUrl(
  storageKey: string,
  opts: { downloadFileName?: string } = {},
): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: storageKey,
    // Only set when the caller explicitly asked to download rather than view — forcing this
    // unconditionally would make every image open a save dialog instead of rendering inline.
    ...(opts.downloadFileName
      ? { ResponseContentDisposition: `attachment; filename="${opts.downloadFileName}"` }
      : {}),
  });
  return getSignedUrl(client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}

export function resetS3ClientForTest(): void {
  s3Client = null;
}
