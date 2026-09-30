import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { queryOne } from '../db/pool.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export type Role = 'admin' | 'member';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const SESSION_COOKIE = 'dm_session';

export function signSession(userId: number): string {
  return jwt.sign({ sub: String(userId) }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${config.JWT_EXPIRES_IN_DAYS}d`,
  });
}

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.isProd,
  path: '/',
  maxAge: config.JWT_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
});

/**
 * Reads the session cookie (or a Bearer token, handy for API clients/tests),
 * verifies it and loads the user FROM THE DATABASE. The role therefore always
 * reflects the current database value; nothing in the request can change it.
 * Sets req.user when valid, otherwise leaves it undefined.
 */
async function loadUser(req: Request): Promise<AuthUser | undefined> {
  const header = req.headers.authorization;
  const token: string | undefined =
    req.cookies?.[SESSION_COOKIE] ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
  if (!token) return undefined;
  let userId: number;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    userId = Number(payload.sub);
    if (!Number.isInteger(userId)) return undefined;
  } catch {
    return undefined;
  }
  const user = await queryOne<AuthUser>(
    `SELECT id, name, email, role FROM users WHERE id = $1 AND is_active AND deleted_at IS NULL`,
    [userId],
  );
  return user ?? undefined;
}

/** Attaches req.user if a valid session exists, but does not require one. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = await loadUser(req);
  next();
}

/** Requires a logged-in, active team member or admin. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  // Several routers share the /api prefix; load the user only once per request.
  if (!req.user) req.user = await loadUser(req);
  if (!req.user) throw unauthorized();
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

export const requireAdmin = requireRole('admin');

export const isAdmin = (req: Request) => req.user?.role === 'admin';

/** Admins may act on anything; members only on records they own. */
export function assertOwnerOrAdmin(req: Request, ownerIds: Array<number | null | undefined>) {
  if (isAdmin(req)) return;
  if (!req.user || !ownerIds.some((id) => id === req.user!.id)) {
    throw forbidden('You can only change records you created');
  }
}
