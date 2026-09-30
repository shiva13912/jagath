import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../../config.js';
import { query, queryOne } from '../../db/pool.js';
import { authenticate, optionalAuth, cookieOptions, SESSION_COOKIE, signSession } from '../../middleware/auth.js';
import { body } from '../../middleware/validate.js';
import { audit } from '../../services/audit.js';
import { badRequest, unauthorized } from '../../utils/errors.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many login attempts. Try again in 15 minutes.' } },
});

// A real hash of a random string, so unknown emails take as long as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-' + Math.random(), 10);

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = body(
    req,
    z.object({ email: z.string().trim().toLowerCase().min(3), password: z.string().min(1).max(200) }),
  );
  const user = await queryOne(
    `SELECT id, name, email, role, password_hash FROM users
     WHERE lower(email) = $1 AND is_active AND deleted_at IS NULL`,
    [email],
  );
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Incorrect email or password');

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  await audit(req, { action: 'login', entityType: 'user', entityId: user.id, summary: `${user.name} logged in` });

  res.cookie(SESSION_COOKIE, signSession(user.id), cookieOptions());
  res.json({ user: req.user });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

/** Like /me, but answers 200 with user: null when logged out (used on page load). */
authRouter.get('/session', optionalAuth, async (req, res) => {
  res.json({ user: req.user ?? null });
});

authRouter.get('/me', authenticate, async (req, res) => {
  const me = await queryOne(
    `SELECT id, name, email, phone, role, show_on_public_site, email_public, phone_public, created_at, last_login_at
     FROM users WHERE id = $1`,
    [req.user!.id],
  );
  res.json({ user: me });
});

authRouter.put('/password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = body(
    req,
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
    }),
  );
  const row = await queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
    throw badRequest('Current password is incorrect');
  }
  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user!.id]);
  await audit(req, { action: 'update', entityType: 'user', entityId: req.user!.id, summary: `${req.user!.name} changed their password` });
  res.json({ ok: true });
});
