import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { HttpError } from '../utils/errors.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found' } });
}

/**
 * Converts every error into a consistent JSON shape. Database and unexpected
 * errors are logged server-side but only a generic message reaches the client,
 * so stack traces, SQL or table names never leak.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large'
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? `Unexpected file field "${err.field}"`
          : err.message;
    return res.status(400).json({ error: { code: 'upload_error', message } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_json', message: 'Malformed JSON body' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'too_large', message: 'Request body too large' } });
  }
  // Postgres constraint errors that can reasonably come from user input.
  if (err?.code === '23505') {
    return res.status(409).json({ error: { code: 'conflict', message: 'This record already exists' } });
  }
  if (err?.code === '23503') {
    return res.status(400).json({ error: { code: 'bad_reference', message: 'A referenced record does not exist' } });
  }
  if (err?.code === '23514') {
    return res.status(400).json({ error: { code: 'invalid', message: 'A value is outside the allowed range' } });
  }
  if (!config.isTest) console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong. Please try again.' } });
}
