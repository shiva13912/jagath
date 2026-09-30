import type { Queryable } from '../../db/pool.js';
import { pool, queryOne } from '../../db/pool.js';
import { year as yearSchema } from '../../middleware/validate.js';
import { notFound } from '../../utils/errors.js';

export interface EventRow {
  id: number;
  year: number;
  title: string;
  is_published: boolean;
  public_finance: boolean;
  public_contributor_names: boolean;
  public_expense_list: boolean;
  public_saree_sales: boolean;
  default_expected_contribution: number;
}

export const EVENT_FIELDS = `id, year, title, description, location, start_date, end_date, default_expected_contribution,
  is_published, public_finance, public_contributor_names, public_expense_list, public_saree_sales, created_at, updated_at`;

/** Looks up a (non-deleted) event by its year, e.g. from /events/2026/... */
export async function eventByYear(rawYear: unknown, client: Queryable = pool, lock = false): Promise<EventRow> {
  const year = yearSchema.safeParse(rawYear);
  if (!year.success) throw notFound('Event year');
  const ev = await queryOne<EventRow>(
    `SELECT ${EVENT_FIELDS} FROM events WHERE year = $1 AND deleted_at IS NULL ${lock ? 'FOR UPDATE' : ''}`,
    [year.data],
    client,
  );
  if (!ev) throw notFound(`Event ${year.data}`);
  return ev;
}

/** Makes sure a member is on the year's roster (used when they record a payment). */
export async function ensureOnRoster(eventId: number, userId: number, client: Queryable) {
  await client.query(
    `INSERT INTO event_members (event_id, user_id, expected_amount)
     SELECT $1, $2, default_expected_contribution FROM events WHERE id = $1
     ON CONFLICT DO NOTHING`,
    [eventId, userId],
  );
}
