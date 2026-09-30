import {
  CreateBucketCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { env } from '../../config/env';
import { logger } from '../../infra/logger';

export const storageEnabled = Boolean(env.S3_ENDPOINT && env.S3_ACCESS_KEY && env.S3_SECRET_KEY);

function makeClient(endpoint: string | undefined) {
  return new S3Client({
    region: env.S3_REGION,
    endpoint,
    forcePathStyle: true, // MinIO / R2 style URLs
    credentials: { accessKeyId: env.S3_ACCESS_KEY ?? '', secretAccessKey: env.S3_SECRET_KEY ?? '' },
    // newer SDKs add CRC32 headers to presigned PUTs, which browsers cannot satisfy
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/** server -> storage traffic (inside the docker network) */
const internal = makeClient(env.S3_ENDPOINT);
/** signs URLs that the BROWSER will call, so it must use the publicly reachable host */
const signer = makeClient(env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT);

export async function ensureBucket(): Promise<void> {
  if (!storageEnabled) return;
  try {
    await internal.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  } catch {
    await internal.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    logger.info({ bucket: env.S3_BUCKET }, 'created bucket');
  }
}

export const presignPut = (key: string, contentType: string) =>
  getSignedUrl(signer, new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 15 * 60 });

export const presignGet = (key: string) =>
  getSignedUrl(signer, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: 6 * 60 * 60 });

export async function objectExists(key: string): Promise<boolean> {
  try {
    await internal.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function downloadTo(key: string, file: string): Promise<void> {
  const res = await internal.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  await pipeline(res.Body as Readable, createWriteStream(file));
}

export async function uploadFrom(file: string, key: string, contentType: string): Promise<void> {
  const { size } = await stat(file);
  await internal.send(
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: createReadStream(file), ContentLength: size, ContentType: contentType }),
  );
}
