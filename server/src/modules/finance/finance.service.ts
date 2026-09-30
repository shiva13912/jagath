/**
 * THE place where money is added up. Every total shown anywhere (team
 * dashboard, public finance page, reports) comes from these functions, which
 * compute from transaction rows on every call. Nothing here is stored.
 *
 *   total income   = contributions + other income + saree sales
 *   total expenses = expenses + saree purchase cost
 *   balance        = total income - total expenses
 */
import type { Queryable } from '../../db/pool.js';
import { pool, query, queryOne } from '../../db/pool.js';

export interface FinanceTotals {
  budget: number;
  contributions: number;
  otherIncome: number;
  sareeSales: number;
  totalIncome: number;
  expenses: number;
  sareePurchases: number;
  totalExpenses: number;
  balance: number;
  budgetUsedPct: number | null;
}

export async function financeTotals(eventId: number, c: Queryable = pool): Promise<FinanceTotals> {
  const r = await queryOne(
    `SELECT
       COALESCE((SELECT planned_amount FROM budgets WHERE event_id = $1), 0) AS budget,
       COALESCE((SELECT SUM(amount) FROM contributions WHERE event_id = $1 AND deleted_at IS NULL), 0) AS contributions,
       COALESCE((SELECT SUM(amount) FROM other_incomes WHERE event_id = $1 AND deleted_at IS NULL), 0) AS other_income,
       COALESCE((SELECT SUM(total_amount) FROM saree_sales WHERE event_id = $1 AND deleted_at IS NULL), 0) AS saree_sales,
       COALESCE((SELECT SUM(amount) FROM expenses WHERE event_id = $1 AND deleted_at IS NULL), 0) AS expenses,
       COALESCE((SELECT SUM(total_amount) FROM saree_purchases WHERE event_id = $1 AND deleted_at IS NULL), 0) AS saree_purchases`,
    [eventId],
    c,
  );
  const round = (n: number) => Math.round(n * 100) / 100;
  const totalIncome = round(r.contributions + r.other_income + r.saree_sales);
  const totalExpenses = round(r.expenses + r.saree_purchases);
  return {
    budget: r.budget,
    contributions: r.contributions,
    otherIncome: r.other_income,
    sareeSales: r.saree_sales,
    totalIncome,
    expenses: r.expenses,
    sareePurchases: r.saree_purchases,
    totalExpenses,
    balance: round(totalIncome - totalExpenses),
    budgetUsedPct: r.budget > 0 ? Math.round((totalExpenses / r.budget) * 1000) / 10 : null,
  };
}

/** One row per rostered member with expected / paid / pending / status. */
export async function contributionStatus(eventId: number, c: Queryable = pool) {
  return query(
    `SELECT em.user_id, u.name, u.show_on_public_site, em.expected_amount AS expected,
            COALESCE(p.paid, 0) AS paid,
            GREATEST(em.expected_amount - COALESCE(p.paid, 0), 0) AS pending,
            CASE WHEN COALESCE(p.paid, 0) >= em.expected_amount THEN 'paid'
                 WHEN COALESCE(p.paid, 0) > 0 THEN 'partial'
                 ELSE 'pending' END AS status,
            p.last_paid_on, COALESCE(p.payments, 0) AS payments
     FROM event_members em
     JOIN users u ON u.id = em.user_id
     LEFT JOIN (
       SELECT user_id, SUM(amount) AS paid, MAX(paid_on) AS last_paid_on, COUNT(*) AS payments
       FROM contributions WHERE event_id = $1 AND deleted_at IS NULL GROUP BY user_id
     ) p ON p.user_id = em.user_id
     WHERE em.event_id = $1
     ORDER BY CASE WHEN COALESCE(p.paid, 0) >= em.expected_amount THEN 2 WHEN COALESCE(p.paid, 0) > 0 THEN 1 ELSE 0 END, u.name`,
    [eventId],
    c,
  );
}

export function summarizeContributions(rows: Array<{ expected: number; paid: number; pending: number; status: string }>) {
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    members: rows.length,
    paid: rows.filter((r) => r.status === 'paid').length,
    partial: rows.filter((r) => r.status === 'partial').length,
    pending: rows.filter((r) => r.status === 'pending').length,
    expected: round(rows.reduce((s, r) => s + r.expected, 0)),
    // "Received" = all money from rostered members (including any overpayment).
    received: round(rows.reduce((s, r) => s + r.paid, 0)),
    pendingAmount: round(rows.reduce((s, r) => s + r.pending, 0)),
  };
}

/** Expense totals per category. Saree purchases are folded into "Sarees". */
export async function expensesByCategory(eventId: number, c: Queryable = pool) {
  return query<{ category: string; amount: number; count: number }>(
    `WITH cat AS (
       SELECT ec.name AS category, ec.sort_order, SUM(e.amount) AS amount, COUNT(*) AS count
       FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.event_id = $1 AND e.deleted_at IS NULL
       GROUP BY ec.name, ec.sort_order
       UNION ALL
       SELECT 'Sarees', COALESCE((SELECT sort_order FROM expense_categories WHERE lower(name) = 'sarees'), 4),
              SUM(total_amount), COUNT(*)
       FROM saree_purchases WHERE event_id = $1 AND deleted_at IS NULL
       HAVING COUNT(*) > 0
     )
     SELECT category, SUM(amount) AS amount, SUM(count)::int AS count
     FROM cat GROUP BY category ORDER BY SUM(amount) DESC`,
    [eventId],
    c,
  );
}

export async function sareeSummary(eventId: number, c: Queryable = pool) {
  const r = await queryOne(
    `SELECT
       COALESCE((SELECT SUM(quantity) FROM saree_purchases WHERE event_id = $1 AND deleted_at IS NULL), 0) AS purchased,
       COALESCE((SELECT SUM(total_amount) FROM saree_purchases WHERE event_id = $1 AND deleted_at IS NULL), 0) AS purchase_cost,
       COALESCE((SELECT SUM(quantity) FROM saree_sales WHERE event_id = $1 AND deleted_at IS NULL), 0) AS sold,
       COALESCE((SELECT SUM(total_amount) FROM saree_sales WHERE event_id = $1 AND deleted_at IS NULL), 0) AS sales_revenue`,
    [eventId],
    c,
  );
  return {
    purchased: r.purchased,
    sold: r.sold,
    remaining: r.purchased - r.sold,
    purchaseCost: r.purchase_cost,
    salesRevenue: r.sales_revenue,
    profit: Math.round((r.sales_revenue - r.purchase_cost) * 100) / 100,
    avgPurchasePrice: r.purchased ? Math.round((r.purchase_cost / r.purchased) * 100) / 100 : 0,
    avgSalePrice: r.sold ? Math.round((r.sales_revenue / r.sold) * 100) / 100 : 0,
  };
}

/** Income and expenses per year, oldest first. */
export async function yearlyTrend(publishedOnly: boolean) {
  return query<{ year: number; income: number; expenses: number; balance: number }>(
    `SELECT e.year,
       (COALESCE(c.s,0) + COALESCE(o.s,0) + COALESCE(ss.s,0)) AS income,
       (COALESCE(x.s,0) + COALESCE(sp.s,0)) AS expenses,
       (COALESCE(c.s,0) + COALESCE(o.s,0) + COALESCE(ss.s,0)) - (COALESCE(x.s,0) + COALESCE(sp.s,0)) AS balance
     FROM events e
     LEFT JOIN (SELECT event_id, SUM(amount) s FROM contributions WHERE deleted_at IS NULL GROUP BY event_id) c ON c.event_id = e.id
     LEFT JOIN (SELECT event_id, SUM(amount) s FROM other_incomes WHERE deleted_at IS NULL GROUP BY event_id) o ON o.event_id = e.id
     LEFT JOIN (SELECT event_id, SUM(total_amount) s FROM saree_sales WHERE deleted_at IS NULL GROUP BY event_id) ss ON ss.event_id = e.id
     LEFT JOIN (SELECT event_id, SUM(amount) s FROM expenses WHERE deleted_at IS NULL GROUP BY event_id) x ON x.event_id = e.id
     LEFT JOIN (SELECT event_id, SUM(total_amount) s FROM saree_purchases WHERE deleted_at IS NULL GROUP BY event_id) sp ON sp.event_id = e.id
     WHERE e.deleted_at IS NULL ${publishedOnly ? 'AND e.is_published AND e.public_finance' : ''}
     ORDER BY e.year`,
  );
}

/** Everything the team dashboard needs in one call, from one consistent snapshot. */
export async function dashboard(eventId: number, userId: number) {
  const c = await pool.connect();
  try {
    // REPEATABLE READ: every query below sees the same committed state.
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const finance = await financeTotals(eventId, c);
    const status = await contributionStatus(eventId, c);
    const byCategory = await expensesByCategory(eventId, c);
    const sarees = await sareeSummary(eventId, c);
    const recentExpenses = await query(
      `SELECT e.id, e.amount, e.spent_on, e.description, ec.name AS category, u.name AS paid_by_name, e.created_at,
              (SELECT COUNT(*) FROM expense_proofs p WHERE p.expense_id = e.id AND p.deleted_at IS NULL) AS proof_count
       FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id JOIN users u ON u.id = e.paid_by
       WHERE e.event_id = $1 AND e.deleted_at IS NULL ORDER BY e.created_at DESC LIMIT 8`,
      [eventId],
      c,
    );
    const highestExpenses = await query(
      `SELECT e.id, e.amount, e.spent_on, e.description, ec.name AS category, u.name AS paid_by_name
       FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id JOIN users u ON u.id = e.paid_by
       WHERE e.event_id = $1 AND e.deleted_at IS NULL ORDER BY e.amount DESC, e.id LIMIT 5`,
      [eventId],
      c,
    );
    const recentContributions = await query(
      `SELECT co.id, co.amount, co.paid_on, u.name AS member_name, co.created_at, (co.proof_file_id IS NOT NULL) AS has_proof
       FROM contributions co JOIN users u ON u.id = co.user_id
       WHERE co.event_id = $1 AND co.deleted_at IS NULL ORDER BY co.created_at DESC LIMIT 8`,
      [eventId],
      c,
    );
    const media = await queryOne(
      `SELECT COUNT(*) FILTER (WHERE type = 'photo') AS photos, COUNT(*) FILTER (WHERE type = 'video') AS videos,
              COUNT(*) FILTER (WHERE NOT is_public) AS unpublished
       FROM media WHERE event_id = $1 AND deleted_at IS NULL`,
      [eventId],
      c,
    );
    const recentActivity = await query(
      `SELECT a.id, a.action, a.entity_type, a.summary, a.created_at, u.name AS user_name
       FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.event_id = $1 AND a.action <> 'login' ORDER BY a.created_at DESC, a.id DESC LIMIT 10`,
      [eventId],
      c,
    );
    await c.query('COMMIT');
    const mine = status.find((s) => s.user_id === userId) ?? null;
    return {
      finance,
      contributions: summarizeContributions(status),
      contributionStatus: status.map(({ show_on_public_site: _s, ...r }) => r),
      myContribution: mine && { expected: mine.expected, paid: mine.paid, pending: mine.pending, status: mine.status, lastPaidOn: mine.last_paid_on },
      expensesByCategory: byCategory,
      recentExpenses,
      highestExpenses,
      recentContributions,
      sarees,
      media,
      recentActivity,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}
