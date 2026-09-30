import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import multer from 'multer';
import { badRequest } from '../utils/errors.js';

const tmpDir = path.join(os.tmpdir(), 'durgamatha-incoming');
fs.mkdirSync(tmpDir, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: tmpDir,
  filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
});

/** multer instance with a per-file byte limit. Files land in a temp dir first. */
export const uploader = (maxBytes: number, maxFiles = 10) =>
  multer({ storage: diskStorage, limits: { fileSize: maxBytes, files: maxFiles, fields: 50 } });

export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/3gpp'];

export const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'video/3gpp': '3gp',
};

/**
 * Checks the file's real type from its first bytes (magic numbers), ignoring
 * the name and the browser-supplied mimetype, which are trivially spoofed.
 */
export async function detectType(file: Express.Multer.File, allowed: string[], label: string): Promise<string> {
  const type = await fileTypeFromFile(file.path);
  let mime = type?.mime as string | undefined;
  if (mime === 'video/mp4' || mime === 'video/x-m4v') mime = 'video/mp4';
  if (!mime || !allowed.includes(mime)) {
    const nice = allowed.map((m) => EXT[m]?.toUpperCase()).filter(Boolean).join(', ');
    throw badRequest(`${label} "${file.originalname}" is not an allowed file type (${nice})`);
  }
  return mime;
}

export function cleanupTemp(files: Express.Multer.File[] | undefined) {
  for (const f of files ?? []) fs.rm(f.path, { force: true }, () => {});
}

/** Flattens req.files from multer.fields() into a map of field -> files. */
export function filesByField(req: { files?: unknown }): Record<string, Express.Multer.File[]> {
  const f = req.files as Record<string, Express.Multer.File[]> | Express.Multer.File[] | undefined;
  if (!f) return {};
  if (Array.isArray(f)) return { files: f };
  return f;
}

export function allFiles(req: { files?: unknown; file?: Express.Multer.File }): Express.Multer.File[] {
  const map = filesByField(req);
  const list = Object.values(map).flat();
  if (req.file) list.push(req.file);
  return list;
}
