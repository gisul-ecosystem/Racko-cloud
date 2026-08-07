/**
 * SeaweedFS S3-compatible storage service.
 *
 * Uses the AWS SDK S3 client pointed at the existing SeaweedFS instance at
 * https://storage.gisul.co.in — which exposes a full S3-compatible API.
 *
 * All VM activity files (file_write events during change tracking) are stored
 * in the `racko-vm-activity` bucket and retrieved during clone replay.
 *
 * Object key format: <machineId>/<pathHash>_<sha256>_<safeFilename>
 *
 * Flat single-level key under the machineId prefix. No sub-folders means
 * no directory placeholder objects are created by SeaweedFS, so deleting
 * a file object leaves nothing behind. On machine reset, a single
 * ListObjectsV2 + DeleteObjects call with the machineId prefix cleans
 * everything up in one shot.
 *
 * pathHash = first 16 hex chars of SHA256(filePath) — scopes the key to
 * the specific file location so two files with the same name and content
 * at different paths never share a key.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { config } from '../config';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadResult {
  storageRef: string;  // S3 object key — stored in MachineActivity.payload.storageRef
  sizeBytes: number;
}

// ─── S3 client (singleton) ────────────────────────────────────────────────────

function buildClient(): S3Client {
  return new S3Client({
    endpoint:          config.SEAWEEDFS_ENDPOINT,
    region:            'us-east-1',      // SeaweedFS ignores region but SDK requires one
    credentials: {
      accessKeyId:     config.SEAWEEDFS_ACCESS_KEY,
      secretAccessKey: config.SEAWEEDFS_SECRET_KEY,
    },
    forcePathStyle: true,  // required for SeaweedFS S3 — disables virtual-hosted-style
  });
}

// Lazy singleton — created on first use so config is fully loaded
let _client: S3Client | null = null;
function getClient(): S3Client {
  if (!_client) _client = buildClient();
  return _client;
}

// ─── SeaweedFSService ─────────────────────────────────────────────────────────

class SeaweedFSService {
  private get bucket(): string {
    return config.SEAWEEDFS_BUCKET;
  }

  /**
   * Upload a file buffer to SeaweedFS via S3 PutObject.
   *
   * The storageRef returned is the S3 object key.
   * Key format: <machineId>/<pathHash>/<sha256>/<filename>
   *
   * pathHash = first 16 hex chars of SHA256(filePath) — ensures files at
   * different paths with the same name/content get unique S3 keys.
   *
   * @param buffer      File content as a Buffer (already read from multer)
   * @param machineId   Owning machine ID — used as the key prefix for organisation
   * @param sha256      SHA256 hash of the file — used for content deduplication within same path
   * @param filename    Original filename
   * @param mimeType    MIME type of the file
   * @param filePath    Full file path on the agent machine — used to scope the key per location
   */
  async upload(
    buffer: Buffer,
    machineId: string,
    sha256: string,
    filename: string,
    mimeType: string,
    filePath?: string
  ): Promise<UploadResult> {
    // Flat key: machineId/<pathHash>_<sha256>_<safeFilename>
    // Single level under machineId — no sub-folder placeholders created,
    // so delete leaves nothing behind and reset bulk-delete is one prefix scan.
    const safeFilename = filename.replace(/[^a-zA-Z0-9._\-]/g, '_');
    const pathHash = filePath
      ? createHash('sha256').update(filePath.toLowerCase()).digest('hex').slice(0, 16)
      : sha256.slice(0, 16);
    const key = `${machineId}/${pathHash}_${sha256}_${safeFilename}`;

    logger.debug('[SeaweedFS] Uploading file', {
      bucket: this.bucket,
      key,
      mimeType,
      sizeBytes: buffer.length,
    });

    await getClient().send(new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         key,
      Body:        buffer,
      ContentType: mimeType,
      ContentLength: buffer.length,
    }));

    logger.info('[SeaweedFS] File uploaded', { key, sizeBytes: buffer.length });

    return { storageRef: key, sizeBytes: buffer.length };
  }

  /**
   * Download a file from SeaweedFS as a Node.js Readable stream.
   * The caller pipes this directly to the HTTP response — no buffering.
   *
   * @param storageRef  The S3 object key returned by upload()
   */
  async download(storageRef: string): Promise<{
    stream: NodeJS.ReadableStream;
    contentType: string;
    contentLength: number | null;
  }> {
    logger.debug('[SeaweedFS] Downloading file', { bucket: this.bucket, key: storageRef });

    const resp = await getClient().send(new GetObjectCommand({
      Bucket: this.bucket,
      Key:    storageRef,
    }));

    if (!resp.Body) {
      throw new Error(`SeaweedFS returned empty body for key: ${storageRef}`);
    }

    const contentType   = resp.ContentType   ?? 'application/octet-stream';
    const contentLength = resp.ContentLength ?? null;

    // AWS SDK v3 returns a SdkStream — convert to Node.js Readable
    const stream = resp.Body.transformToWebStream
      ? Readable.fromWeb(resp.Body.transformToWebStream() as import('stream/web').ReadableStream<Uint8Array>)
      : resp.Body as unknown as NodeJS.ReadableStream;

    return { stream, contentType, contentLength };
  }

  /**
   * Delete a file from SeaweedFS.
   * Best-effort — logs but does not throw on failure.
   *
   * @param storageRef  The S3 object key to delete
   */
  async delete(storageRef: string): Promise<void> {
    try {
      await getClient().send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key:    storageRef,
      }));
      logger.debug('[SeaweedFS] File deleted', { key: storageRef });
    } catch (err) {
      logger.warn('[SeaweedFS] Delete failed (non-fatal)', { key: storageRef, err });
    }
  }

  /**
   * Generate a presigned PUT URL for direct agent-to-S3 upload.
   *
   * The agent uses this URL to PUT the file directly to SeaweedFS,
   * bypassing nginx and core-api entirely — no size limit, no memory pressure.
   *
   * @param machineId   Owning machine ID (used as key prefix)
   * @param sha256      SHA256 hash of the file (used for content dedup within same path)
   * @param filename    Original filename
   * @param mimeType    MIME type of the file
   * @param ttlSeconds  How long the URL is valid (default: 1 hour)
   * @param filePath    Full file path on the agent machine — scopes key per location
   * @returns           { presignedUrl, storageRef }
   */
  async generatePresignedPutUrl(
    machineId: string,
    sha256: string,
    filename: string,
    mimeType: string,
    ttlSeconds = 3600,
    filePath?: string
  ): Promise<{ presignedUrl: string; storageRef: string }> {
    const safeFilename = filename.replace(/[^a-zA-Z0-9._\-]/g, '_');
    // Flat key: machineId/<pathHash>_<sha256>_<safeFilename>
    const pathHash = filePath
      ? createHash('sha256').update(filePath.toLowerCase()).digest('hex').slice(0, 16)
      : sha256.slice(0, 16);
    const storageRef = `${machineId}/${pathHash}_${sha256}_${safeFilename}`;

    const command = new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         storageRef,
      ContentType: mimeType,
    });

    const presignedUrl = await getSignedUrl(getClient(), command, {
      expiresIn: ttlSeconds,
    });

    logger.debug('[SeaweedFS] Generated presigned PUT URL', { storageRef, ttlSeconds });

    return { presignedUrl, storageRef };
  }

  /**
   * Generate a presigned GET URL for direct client-to-S3 download/preview.
   *
   * The client (racko-app) uses this URL to fetch the file directly from
   * SeaweedFS, bypassing core-api entirely — no API memory pressure, no size limit.
   * URL expires after ttlSeconds — cannot be reused or shared after expiry.
   *
   * @param storageRef  The S3 object key (from SharedFile.storageRef)
   * @param ttlSeconds  How long the URL is valid (60s for read-only, 300s for download)
   * @returns           { presignedUrl }
   */
  async generatePresignedGetUrl(
    storageRef: string,
    ttlSeconds = 60,
  ): Promise<{ presignedUrl: string }> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key:    storageRef,
    });

    const presignedUrl = await getSignedUrl(getClient(), command, {
      expiresIn: ttlSeconds,
    });

    logger.debug('[SeaweedFS] Generated presigned GET URL', { storageRef, ttlSeconds });
    return { presignedUrl };
  }
}

export const seaweedfsService = new SeaweedFSService();
