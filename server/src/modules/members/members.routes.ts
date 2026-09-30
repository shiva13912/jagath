import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, tx } from '../../db/pool.js';
import { authenticate, isAdmin, requireAdmin } from '../../middleware/auth.js';
import { body, boolish, id, optionalText, requiredText } from '../../middleware/validate.js';
import { audit, notifyChange } from '../../services/audit.js';
import { diff } from '../../utils/format.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';

export const membersRouter = Router();
membersRouter.use(authenticate);

const TEAM_FIELDS = `id, name, email, phone, role, is_active, show_on_public_site, email_public, phone_public, created_at`;
const ADMIN_FIELDS = `${TEAM_FIELDS}, notes, last_login_at, updated_at`;

const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^[+\d][\d\s-]*$/, 'Phone may contain digits, spaces, + and -')
  .optional()
  .nullable()
  .or(z.literal('').transform(() => null));

const profileFields = {
  name: requiredText(120, 'Name'),
  phone,
  showOnPublicSite: boolish.optional(),
  emailPublic: boolish.optional(),
  phonePublic: boolish.optional(),
};

const createSchema = z.object({
  ...profileFields,
  email: z.email('Enter a valid email').trim().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  role: z.enum(['admin', 'member']).default('member'),
  notes: optionalText(1000),
});

const updateSchema = z.object({
  name: profileFields.name.optional(),
  phone,
  email: z.email('Enter a valid email').trim().toLowerCase().optional(),
  role: z.enum(['admin', 'member']).optional(),
  isActive: boolish.optional(),
  showOnPublicSite: boolish.optional(),
  emailPublic: boolish.optional(),
  phonePublic: boolish.optional(),
  notes: optionalText(1000),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200).optional(),
});

/** Team members see active members only and no admin notes. Admins see everyone. */
membersRouter.get('/', async (req, res) => {
  const admin = isAdmin(req);
  const rows = await query(
    `SELECT ${admin ? ADMIN_FIELDS : TEAM_FIELDS} FROM users
     WHERE deleted_at IS NULL ${admin ? '' : 'AND is_active'}
     ORDER BY is_active DESC, role, name`,
  );
  res.json({ members: rows });
});

/** Profile self-service. Only whitelisted fields; role/is_active are never read here. */
membersRouter.put('/me', async (req, res) => {
  const data = body(req, z.object({ ...profileFields, name: profileFields.name.optional() }).strict());
  const before = await queryOne(`SELECT ${ADMIN_FIELDS} FROM users WHERE id = $1`, [req.user!.id]);
  const after = await queryOne(
    `UPDATE users SET
       name = COALESCE($2, name),
       phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
       show_on_public_site = COALESCE($5, show_on_public_site),
       email_public = COALESCE($6, email_public),
       phone_public = COALESCE($7, phone_public)
     WHERE id = $1 RETURNING ${TEAM_FIELDS}`,
    [
      req.user!.id,
      data.name ?? null,
      data.phone !== undefined,
      data.phone ?? null,
      data.showOnPublicSite ?? null,
      data.emailPublic ?? null,
      data.phonePublic ?? null,
    ],
  );
  await audit(req, {
    action: 'update',
    entityType: 'user',
    entityId: req.user!.id,
    summary: `${req.user!.name} updated their profile`,
    details: diff(before, after, ['name', 'phone', 'show_on_public_site', 'email_public', 'phone_public']),
  });
  res.json({ member: after });
});

membersRouter.get('/:id', async (req, res) => {
  const memberId = id.parse(req.params.id);
  const admin = isAdmin(req);
  const row = await queryOne(
    `SELECT ${admin ? ADMIN_FIELDS : TEAM_FIELDS} FROM users WHERE id = $1 AND deleted_at IS NULL ${admin ? '' : 'AND is_active'}`,
    [memberId],
  );
  if (!row) throw notFound('Member');
  res.json({ member: row });
});

membersRouter.post('/', requireAdmin, async (req, res) => {
  const data = body(req, createSchema);
  const exists = await queryOne('SELECT 1 FROM users WHERE lower(email) = $1', [data.email]);
  if (exists) throw conflict('A member with this email already exists');
  const hash = await bcrypt.hash(data.password, 12);
  const member = await tx(async (c) => {
    const m = await queryOne(
      `INSERT INTO users (name, email, phone, password_hash, role, show_on_public_site, email_public, phone_public, notes)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,TRUE),COALESCE($7,FALSE),COALESCE($8,FALSE),$9)
       RETURNING ${ADMIN_FIELDS}`,
      [
        data.name,
        data.email,
        data.phone ?? null,
        hash,
        data.role,
        data.showOnPublicSite ?? null,
        data.emailPublic ?? null,
        data.phonePublic ?? null,
        data.notes,
      ],
      c,
    );
    await audit(req, { action: 'create', entityType: 'user', entityId: m.id, summary: `${req.user!.name} added ${data.role} ${m.name}` }, c);
    return m;
  });
  notifyChange('members');
  res.status(201).json({ member });
});

membersRouter.put('/:id', requireAdmin, async (req, res) => {
  const memberId = id.parse(req.params.id);
  const data = body(req, updateSchema);
  const member = await tx(async (c) => {
    const before = await queryOne(`SELECT ${ADMIN_FIELDS} FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [memberId], c);
    if (!before) throw notFound('Member');
    if (memberId === req.user!.id && (data.role === 'member' || data.isActive === false)) {
      throw badRequest('You cannot remove your own admin access or deactivate yourself');
    }
    if (before.role === 'admin' && (data.role === 'member' || data.isActive === false)) {
      await ensureAnotherAdmin(memberId, c);
    }
    if (data.email && data.email !== before.email.toLowerCase()) {
      const taken = await queryOne('SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2', [data.email, memberId], c);
      if (taken) throw conflict('A member with this email already exists');
    }
    const hash = data.password ? await bcrypt.hash(data.password, 12) : null;
    const after = await queryOne(
      `UPDATE users SET
         name = COALESCE($2, name),
         email = COALESCE($3, email),
         phone = CASE WHEN $4::boolean THEN $5 ELSE phone END,
         role = COALESCE($6, role),
         is_active = COALESCE($7, is_active),
         show_on_public_site = COALESCE($8, show_on_public_site),
         email_public = COALESCE($9, email_public),
         phone_public = COALESCE($10, phone_public),
         notes = CASE WHEN $11::boolean THEN $12 ELSE notes END,
         password_hash = COALESCE($13, password_hash)
       WHERE id = $1 RETURNING ${ADMIN_FIELDS}`,
      [
        memberId,
        data.name ?? null,
        data.email ?? null,
        data.phone !== undefined,
        data.phone ?? null,
        data.role ?? null,
        data.isActive ?? null,
        data.showOnPublicSite ?? null,
        data.emailPublic ?? null,
        data.phonePublic ?? null,
        data.notes !== undefined,
        data.notes ?? null,
        hash,
      ],
      c,
    );
    const changes = diff(before, after, ['name', 'email', 'phone', 'role', 'is_active', 'show_on_public_site', 'email_public', 'phone_public', 'notes']);
    if (hash) (changes as any).password = { from: '***', to: 'reset' };
    await audit(req, { action: 'update', entityType: 'user', entityId: memberId, summary: `${req.user!.name} updated member ${after.name}`, details: changes }, c);
    return after;
  });
  notifyChange('members');
  res.json({ member });
});

/** "Delete" deactivates: members with financial history must remain referenced. */
membersRouter.delete('/:id', requireAdmin, async (req, res) => {
  const memberId = id.parse(req.params.id);
  if (memberId === req.user!.id) throw badRequest('You cannot deactivate yourself');
  await tx(async (c) => {
    const m = await queryOne('SELECT id, name, role FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [memberId], c);
    if (!m) throw notFound('Member');
    if (m.role === 'admin') await ensureAnotherAdmin(memberId, c);
    await c.query('UPDATE users SET is_active = FALSE WHERE id = $1', [memberId]);
    await audit(req, { action: 'deactivate', entityType: 'user', entityId: memberId, summary: `${req.user!.name} deactivated ${m.name}` }, c);
  });
  notifyChange('members');
  res.json({ ok: true });
});

async function ensureAnotherAdmin(exceptId: number, c: any) {
  const other = await queryOne(
    `SELECT 1 FROM users WHERE role = 'admin' AND is_active AND deleted_at IS NULL AND id <> $1 LIMIT 1`,
    [exceptId],
    c,
  );
  if (!other) throw badRequest('At least one active admin must remain');
}
