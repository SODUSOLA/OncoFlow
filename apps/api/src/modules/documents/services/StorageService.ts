import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? "oncoflow-uploads";
const R2_JURISDICTION = (process.env.R2_JURISDICTION ?? "").trim().toLowerCase();

// Each R2 jurisdiction has its own endpoint and buckets are invisible across them (NoSuchBucket), so the jurisdiction is explicit and configurable.
const R2_JURISDICTIONS = new Set(["", "eu", "fedramp"]);

// Builds the R2 endpoint URL for the configured jurisdiction.
function r2Endpoint(): string {
  if (!R2_JURISDICTIONS.has(R2_JURISDICTION)) {
    throw new Error(
      `Unsupported R2_JURISDICTION "${R2_JURISDICTION}". Use "eu", "fedramp", or leave it unset for the default jurisdiction.`,
    );
  }
  const host = R2_JURISDICTION ? `${R2_ACCOUNT_ID}.${R2_JURISDICTION}` : R2_ACCOUNT_ID;
  return `https://${host}.r2.cloudflarestorage.com`;
}

// Creates the S3 client for R2, throwing if credentials are missing.
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

// Returns the shared S3 client, creating it lazily.
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = createS3Client();
  }
  return s3Client;
}

// Returns the SHA-256 hex hash of a buffer.
export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// Builds the object key for a file from its patient, type and hash.
export function buildStorageKey(patientId: string | null, mimeType: string, fileHash: string): string {
  const ext = mimeType.split("/").pop() ?? "bin";
  const prefix = patientId ? `patients/${patientId}` : "unattached";
  return `${prefix}/${fileHash.slice(0, 2)}/${fileHash.slice(2, 4)}/${fileHash}.${ext}`;
}

// Uploads a buffer to R2 under the storage key.
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

// Downloads an object's bytes from R2.
export async function downloadFromR2(storageKey: string): Promise<Buffer> {
  const client = getS3Client();
  const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: storageKey }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

// Gate 6: never a public bucket; access uses a 5-minute signed URL minted after authorization, and signing is local so it costs no network call.
const SIGNED_URL_TTL_SECONDS = 300;

// Returns a short-lived signed R2 URL for the storage key.
export async function getSignedDownloadUrl(
  storageKey: string,
  opts: { downloadFileName?: string } = {},
): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: storageKey,
    // Set only when downloading was requested, so images still render inline by default.
    ...(opts.downloadFileName
      ? { ResponseContentDisposition: `attachment; filename="${opts.downloadFileName}"` }
      : {}),
  });
  return getSignedUrl(client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}

// Clears the cached S3 client so tests can reconfigure it.
export function resetS3ClientForTest(): void {
  s3Client = null;
}
