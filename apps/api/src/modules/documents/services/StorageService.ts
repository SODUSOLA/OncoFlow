import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
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

export function resetS3ClientForTest(): void {
  s3Client = null;
}
