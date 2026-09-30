import type { Request } from 'express';
import { pool, type Queryable } from '../db/pool.js';
import { publish } from './realtime.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  eventId?: number | null;
  summary: string;
  details?: unknown;
}

/**
 * Writes one row to the append-only activity log. Pass the transaction client
 * so the log entry commits (or rolls back) together with the change it describes.
 */
export async function audit(req: Request | null, entry: AuditEntry, client: Queryable = pool) {
  await client.query(
    `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, event_id, summary, details, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      req?.user?.id ?? null,
      entry.action,
      entry.entityType,
      entry.entityId == null ? null : String(entry.entityId),
      entry.eventId ?? null,
      entry.summary,
      entry.details == null ? null : JSON.stringify(entry.details),
      req?.ip ?? null,
    ],
  );
}

/** Call after the transaction commits: tells connected dashboards to refetch. */
export function notifyChange(topic: 'finance' | 'media' | 'members' | 'events' | 'sarees', year?: number | null) {
  publish({ topic, year: year ?? null, at: new Date().toISOString() });
}
