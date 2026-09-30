import type { Request } from 'express';
import { z } from 'zod';
import { badRequest } from '../utils/errors.js';

/** Parses and validates input with a zod schema; throws a 400 with field errors on failure. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    const first = Object.entries(fields)[0];
    throw badRequest(first ? `${first[0] === '_' ? '' : first[0] + ': '}${first[1]}` : 'Invalid input', fields);
  }
  return result.data;
}

export const body = <T extends z.ZodTypeAny>(req: Request, schema: T) => parse(schema, req.body ?? {});
export const queryParams = <T extends z.ZodTypeAny>(req: Request, schema: T) => parse(schema, req.query ?? {});

// Reusable field schemas ------------------------------------------------------

const twoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/** Money: positive, max 2 decimals, below ₹1 crore per record. Accepts "4000" from forms. */
export const money = z.coerce
  .number({ error: 'Enter a valid amount' })
  .positive('Amount must be greater than 0')
  .max(10_000_000, 'Amount is too large')
  .refine(twoDecimals, 'At most 2 decimal places');

export const nonNegativeMoney = z.coerce
  .number({ error: 'Enter a valid amount' })
  .min(0, 'Amount cannot be negative')
  .max(100_000_000, 'Amount is too large')
  .refine(twoDecimals, 'At most 2 decimal places');

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-12')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');

export const optionalText = (max = 1000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const requiredText = (max = 500, label = 'This field') =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);

export const id = z.coerce.number().int().positive();

/** Multipart forms send booleans as strings. */
export const boolish = z.union([z.boolean(), z.enum(['true', 'false', '1', '0', 'on'])]).transform((v) =>
  typeof v === 'boolean' ? v : v === 'true' || v === '1' || v === 'on',
);

export const year = z.coerce.number().int().min(2000).max(2100);
