import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config } from './config.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { activityRouter } from './modules/activity/activity.routes.js';
import { contributionsRouter } from './modules/contributions/contributions.routes.js';
import { eventsRouter } from './modules/events/events.routes.js';
import { expensesRouter } from './modules/expenses/expenses.routes.js';
import { filesRouter } from './modules/files/files.routes.js';
import { financeRouter } from './modules/finance/finance.routes.js';
import { mediaRouter } from './modules/media/media.routes.js';
import { membersRouter } from './modules/members/members.routes.js';
import { sareesRouter } from './modules/sarees/sarees.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { publicRouter } from './modules/public/public.routes.js';
import { subscribe } from './services/realtime.js';
import { forbidden } from './utils/errors.js';

const allowedOrigins = config.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);

/**
 * CSRF defence in depth (cookies are already SameSite=Lax): a browser that sends
 * an Origin header on a state-changing request must be one of ours.
 */
function sameOriginWrites(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const host = req.headers.host;
  if (allowedOrigins.includes(origin) || (host && new URL(origin).host === host)) return next();
  throw forbidden('Cross-site request blocked');
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', config.TRUST_PROXY);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          mediaSrc: ["'self'", 'blob:', 'https:'],
          connectSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        },
      },
    }),
  );
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // General API limiter: generous for normal use, stops scripted abuse.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.isTest ? 100_000 : 600,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'rate_limited', message: 'Too many requests, slow down a little.' } },
    }),
  );
  app.use('/api', sameOriginWrites);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  // Public (no login) endpoints first: everything after this requires a session.
  app.get('/api/public/stream', (req, res) => subscribe(req, res, 'public'));
  app.use('/api/public', publicRouter);
  // Media files are served to the public when published, so this router handles its own auth.
  app.use('/api', mediaRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/members', membersRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/settings', settingsRouter);
  // These routers mix /events/:year/... and /<resource>/:id paths.
  app.use('/api', contributionsRouter);
  app.use('/api', expensesRouter);
  app.use('/api', financeRouter);
  app.use('/api', sareesRouter);
  app.get('/api/stream', authenticate, (req, res) => subscribe(req, res, 'team'));

  app.use('/api', notFoundHandler);

  // Production: serve the built React app from the same origin (one service, cookies just work).
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (config.isProd && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.use('/assets', (_req, res) => res.status(404).end());
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
