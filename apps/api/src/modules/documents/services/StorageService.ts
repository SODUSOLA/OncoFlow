import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? "oncoflow-uploads";

function createS3Client(): S3Client {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
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
