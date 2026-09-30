import type { Response } from 'express';
import { config } from '../../config.js';
import { LocalStorage } from './local.js';
import { S3Storage } from './s3.js';

/**
 * Where binary files live. Every object is private; the API decides who may
 * read it and then either streams it (local) or redirects to a short-lived
 * signed URL (S3-compatible: Supabase Storage, Cloudflare R2, AWS S3).
 */
export interface Storage {
  put(key: string, sourcePath: string, contentType: string): Promise<void>;
  /** Sends the object to the client (stream or redirect). */
  send(res: Response, key: string, opts: { contentType: string; downloadName?: string; inline?: boolean; cacheSeconds?: number }): Promise<void>;
  remove(key: string): Promise<void>;
}

export const storage: Storage = config.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();

/** RFC 6266 Content-Disposition that survives non-ASCII file names. */
export function contentDisposition(name: string, inline: boolean): string {
  const safe = name.replace(/[^\w.\- ]+/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
