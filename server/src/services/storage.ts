/**
 * Object storage for uploaded waste photos.
 *   S3_BUCKET set  -> Amazon S3 (SSE-KMS via bucket default), reads via short-lived presigned URLs
 *   otherwise      -> local disk under UPLOAD_DIR
 * Credentials come from the standard AWS chain (env, ~/.aws profile, SSO, or the ECS task role) — never from code.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";

let s3: any = null;
async function client() {
  if (!s3) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    s3 = new S3Client({ region: config.awsRegion });
  }
  return s3;
}

export const storageMode = () => (config.s3Bucket ? "s3" : "local");

const localPath = (key: string) => path.join(config.uploadDir, key.replace(/\//g, path.sep));

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (!config.s3Bucket) {
    fs.mkdirSync(path.dirname(localPath(key)), { recursive: true });
    fs.writeFileSync(localPath(key), body);
    return;
  }
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  await (await client()).send(new PutObjectCommand({ Bucket: config.s3Bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function getObject(key: string): Promise<Buffer | null> {
  if (!config.s3Bucket) {
    return fs.existsSync(localPath(key)) ? fs.readFileSync(localPath(key)) : null;
  }
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const out = await (await client()).send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: key }));
    return Buffer.from(await out.Body.transformToByteArray());
  } catch (e: any) {
    if (e?.name === "NoSuchKey") return null;
    throw e;
  }
}

/** Presigned GET URL (5 minutes) in S3 mode; null in local mode (served by the API instead). */
export async function presignedGetUrl(key: string): Promise<string | null> {
  if (!config.s3Bucket) return null;
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return getSignedUrl(await client(), new GetObjectCommand({ Bucket: config.s3Bucket, Key: key }), { expiresIn: 300 });
}

export async function storageHealth() {
  if (!config.s3Bucket) return { mode: "local", ok: true };
  try {
    const { HeadBucketCommand } = await import("@aws-sdk/client-s3");
    await (await client()).send(new HeadBucketCommand({ Bucket: config.s3Bucket }));
    return { mode: "s3", bucket: config.s3Bucket, ok: true };
  } catch (e: any) {
    return { mode: "s3", bucket: config.s3Bucket, ok: false, error: e?.name ?? String(e) };
  }
}
