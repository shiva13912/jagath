import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Response } from 'express';
import { config } from '../../config.js';
import { contentDisposition, type Storage } from './index.js';

const SIGNED_URL_SECONDS = 300;

/** Any S3-compatible bucket. The bucket must be PRIVATE (no public read policy). */
export class S3Storage implements Storage {
  private client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT || undefined,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: config.S3_ACCESS_KEY_ID!, secretAccessKey: config.S3_SECRET_ACCESS_KEY! },
  });
  private bucket = config.S3_BUCKET!;

  async put(key: string, sourcePath: string, contentType: string) {
    const { size } = await stat(sourcePath);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: createReadStream(sourcePath), ContentLength: size, ContentType: contentType }),
    );
  }

  async send(res: Response, key: string, opts: { contentType: string; downloadName?: string; inline?: boolean; cacheSeconds?: number }) {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: opts.contentType,
        ResponseContentDisposition: opts.downloadName ? contentDisposition(opts.downloadName, opts.inline ?? true) : undefined,
      }),
      { expiresIn: SIGNED_URL_SECONDS },
    );
    // Short private cache so a gallery scroll doesn't re-sign every thumbnail.
    res.setHeader('Cache-Control', `private, max-age=${Math.min(opts.cacheSeconds ?? 0, SIGNED_URL_SECONDS - 30)}`);
    res.redirect(302, url);
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
