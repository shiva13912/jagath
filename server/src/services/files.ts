import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { queryOne } from '../db/pool.js';
import { allFiles, cleanupTemp, detectType, EXT, PROOF_TYPES } from '../middleware/upload.js';
import { storage } from './storage/index.js';

export type FilePurpose = 'contribution_proof' | 'expense_payment' | 'expense_bill' | 'saree_bill' | 'saree_photo' | 'other';

export interface StoredFile {
  key: string;
  originalName: string;
  mime: string;
  size: number;
}

/**
 * Validates and uploads one private document to storage. Returns metadata to
 * insert in the `files` table. Call inside `trackUploads` so objects are
 * removed again if the database transaction fails.
 */
export async function storePrivate(file: Express.Multer.File, year: number, tracker: string[], allowed = PROOF_TYPES, label = 'File'): Promise<StoredFile> {
  const mime = await detectType(file, allowed, label);
  const key = `events/${year}/private/${crypto.randomUUID()}.${EXT[mime] ?? 'bin'}`;
  await storage.put(key, file.path, mime);
  tracker.push(key);
  return { key, originalName: file.originalname.slice(0, 200), mime, size: file.size };
}

export async function insertFile(c: PoolClient, f: StoredFile, purpose: FilePurpose, eventId: number, userId: number): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO files (event_id, storage_key, original_name, mime_type, size_bytes, purpose, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [eventId, f.key, f.originalName, f.mime, f.size, purpose, userId],
    c,
  );
  return row!.id;
}

/**
 * Runs `fn` with a list that collects every storage key written. If `fn`
 * throws, those objects are deleted so storage never holds orphans. Temp
 * upload files are always cleaned up.
 */
export async function trackUploads<T>(req: Request, fn: (keys: string[]) => Promise<T>): Promise<T> {
  const keys: string[] = [];
  try {
    return await fn(keys);
  } catch (err) {
    await Promise.all(keys.map((k) => storage.remove(k).catch(() => {})));
    throw err;
  } finally {
    cleanupTemp(allFiles(req));
  }
}

/** Express middleware wrapper that always removes temp files, even on validation errors. */
export function cleanupAfter(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, _next: NextFunction) => {
    try {
      await handler(req, res);
    } finally {
      cleanupTemp(allFiles(req));
    }
  };
}

export const FILE_JSON = (alias: string) =>
  `CASE WHEN ${alias}.id IS NULL THEN NULL ELSE json_build_object('id', ${alias}.id, 'original_name', ${alias}.original_name, 'mime_type', ${alias}.mime_type, 'size_bytes', ${alias}.size_bytes) END`;
