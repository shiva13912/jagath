# Durgamatha Event Platform

One place for the team to run the yearly Durgamatha Event: who paid, what was spent, what is left, saree sales, photos and videos, and a public website that shows the community where the money went. Every year gets its own records, and old years stay available as history.

> All names, phone numbers, amounts and images in the seed data are fake.

## The problem it solves

Today the money trail lives in WhatsApp chats, payment screenshots and one person's notebook. That makes it hard to answer simple questions ("who hasn't paid yet?", "how much is left for flowers?") and hard to show the community that the money was used honestly. This app keeps every rupee in one database with proof attached, calculates the totals live, and lets the admin publish a clean summary for the public.

## Features

| Area | What it does |
|---|---|
| Members | Admin creates accounts, sets roles, deactivates people. Members edit their own profile. |
| Years (events) | One record per year with its dates, theme and budget. New years are created from the admin screen; nothing is tied to 2026. |
| Contributions | Expected amount per member (the roster) and the payments against it. Status is calculated: **Paid**, **Partial** or **Pending**. Payment screenshots are attached. |
| Expenses | Category, amount, who paid, date, notes, plus payment screenshots and bills. Search, filter, sort, pagination. Full edit history. |
| Budget | Planned amount per category versus what was actually spent. |
| Other income | Donations, sponsorships, hundi collections and similar. |
| Dashboard | Income, expenses, balance, budget used, contribution status, category chart, year-on-year trend, recent activity. **Updates live** on every device when anyone adds or edits a record. |
| Sarees | Purchases (cost), sales (revenue), live stock, overselling blocked, yearly history. |
| Photos and videos | Albums per year, multi-file upload from a phone, automatic thumbnails, EXIF/GPS stripped from photos, admin approval before anything goes public, featured items. |
| Public website | Home, year pages, gallery, videos, finance summary, saree summary, about. No login. The admin controls exactly what is shown per year. |
| Audit log | Every create, edit and delete is recorded with before/after values. The log cannot be edited or deleted, not even by the database owner through normal SQL. |

## Roles

| | Admin | Team member | Public |
|---|---|---|---|
| Manage members, roles, years, budget, settings | ✓ | | |
| Add contributions | ✓ (anyone) | ✓ (own only) | |
| Add expenses, saree records, photos, videos | ✓ | ✓ | |
| Edit a record | ✓ | own records | |
| Delete a record (soft delete) | ✓ | | |
| Approve and publish media | ✓ | | |
| See payment screenshots and bills | ✓ | ✓ | never |
| Full audit log | ✓ | limited feed | |
| Public website | ✓ | ✓ | ✓ |

Every rule above is enforced by the API, not just hidden in the UI. The role is read from the database on every request, so a changed role or a deactivated account takes effect immediately, and a member cannot promote themselves by editing a request.

## Architecture

```
Browser (React SPA)  ──HTTPS──▶  Express API (Node, TypeScript)  ──▶  PostgreSQL
      ▲                               │
      └──── Server-Sent Events ◀──────┤
                                      └──▶  Private object storage (local disk or S3-compatible)
```

- In production one Node service serves both the API (`/api/...`) and the built React app, so there is one URL and cookies just work.
- Files are **never public URLs**. The API checks permissions and then streams the file (local driver) or redirects to a signed URL that expires after 5 minutes (S3 driver).
- Live updates: after any change the API sends a tiny "finance changed for 2026" message over Server-Sent Events. Browsers then refetch what they display. No numbers travel over the stream, so nothing private leaks to the public stream.

The full design (A to K: architecture, ER diagram, relationships, folder structure, pages, API, auth, permission matrix, storage, live updates, plan) is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). What was built in each phase is in [docs/PHASES.md](docs/PHASES.md).

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, React Router, TanStack Query, Axios, Recharts, lucide icons.
- **Backend:** Node 20+, Express 5, TypeScript, zod validation, `pg` with plain parameterised SQL, bcryptjs, JWT in an httpOnly cookie, helmet, express-rate-limit, multer, file-type, sharp.
- **Database:** PostgreSQL 14+ (Supabase, Neon, Render or local).
- **Storage:** local disk for development; any S3-compatible bucket in production (Supabase Storage recommended).
- **Tests:** Vitest + Supertest against a real PostgreSQL test database; a Playwright end-to-end workflow script.

## Database schema (summary)

| Table | Purpose |
|---|---|
| `users` | Team accounts, role (`admin` / `member`), active flag |
| `events` | One row per year, plus public visibility flags |
| `event_members` | Roster: who is expected to contribute how much in a year |
| `budgets` | Planned amount per category per year |
| `contributions` | Payments from members, with an optional proof file |
| `other_incomes` | Donations and other income |
| `expense_categories`, `expenses`, `expense_proofs` | Expenses with any number of payment/bill files |
| `saree_purchases`, `saree_sales` | Saree stock in and out (`total_amount` is a generated column) |
| `albums`, `media` | Photos and videos with approval and visibility |
| `files` | Metadata for every private upload (storage key, type, size) |
| `settings` | Key/value app settings |
| `activity_logs` | Append-only audit trail (a trigger blocks UPDATE, DELETE and TRUNCATE) |

Money is `NUMERIC(12,2)`. Totals, balances and contribution status are **calculated**, never stored, so they cannot drift. Records are soft deleted (`deleted_at`, `deleted_by`, reason) so history is never silently lost. Migrations live in `server/src/db/migrations/` and are applied in order.

## Getting started (local development)

### 1. Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer running locally (or a free Supabase/Neon database)
- Optional: `ffmpeg` on the PATH, used only by the seed script to generate sample videos (set `FFMPEG_PATH` if it is elsewhere). Without it the seed skips videos.

### 2. Install

```bash
npm install
```

### 3. Create a database

```bash
createuser durgamatha --pwprompt          # choose a local password
createdb durgamatha -O durgamatha
createdb durgamatha_test -O durgamatha    # used by the automated tests
```

### 4. Configure the environment

```bash
cp .env.example server/.env
```

Then edit `server/.env`:

- `DATABASE_URL=postgres://durgamatha:<your password>@localhost:5432/durgamatha`
- `JWT_SECRET=` a long random value: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

The server refuses to start if a required variable is missing or too weak. No secret is hard-coded anywhere in the code.

### 5. Migrate and seed

```bash
npm run migrate   # create tables (also runs automatically when the server starts)
npm run seed      # DEVELOPMENT ONLY: wipes the database and loads fake data for 2024, 2025, 2026
```

Seeded logins (all fake, password `durga2026`):

| Email | Role |
|---|---|
| `admin@durgamatha.test` | Admin |
| `ravi@durgamatha.test` | Team member |

Eight more fake members exist; see `server/src/db/seed.ts`. The seed refuses to run when `NODE_ENV=production`.

### 6. Run

```bash
npm run dev
```

- App: http://localhost:5173 (public site) and http://localhost:5173/app (team area, after login)
- API: http://localhost:4000/api/health

Vite proxies `/api` to the API, so the browser only ever talks to one origin.

## Environment variables

All variables are documented in [.env.example](.env.example).

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | | `development`, `production` or `test` |
| `PORT` | | Default `4000` |
| `CLIENT_ORIGIN` | | Allowed browser origin(s) for write requests, comma separated. Set it to your public URL in production. |
| `TRUST_PROXY` | | `1` behind one reverse proxy (Render, Railway, Nginx) |
| `DATABASE_URL` | ✓ | PostgreSQL connection string |
| `JWT_SECRET` | ✓ | At least 32 characters, random |
| `JWT_EXPIRES_IN_DAYS` | | Default `7` |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | for `seed:admin` | First real admin in production |
| `STORAGE_DRIVER` | | `local` (default) or `s3` |
| `LOCAL_UPLOAD_DIR` | | Default `./uploads` (outside any public folder) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | when `s3` | See storage below |
| `MAX_PHOTO_MB`, `MAX_VIDEO_MB`, `MAX_PROOF_MB` | | Upload size limits |

## File storage

**Choice: Supabase Storage through its S3-compatible API.** It is free for a small team, lives next to a Supabase PostgreSQL database, keeps buckets private, and supports signed URLs. Because the app speaks plain S3, Cloudflare R2, AWS S3 or MinIO work too with no code changes.

Setup:

1. In Supabase, go to Storage and create a bucket (for example `durgamatha`). Leave **Public bucket off**.
2. Go to Project Settings, then Storage, then S3 Connection. Enable it and create an access key.
3. Set:
   ```
   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3
   S3_REGION=<your project region>
   S3_BUCKET=durgamatha
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_FORCE_PATH_STYLE=true
   ```

How files are protected:

- Every file is stored privately under a random key; the original filename is only kept as metadata.
- The file type is checked from the file's actual bytes, not its name or the browser's claim. Allowed: JPEG, PNG, WebP, HEIC and PDF for proofs; images for photos; MP4, WebM and MOV for videos.
- Payment screenshots and bills are only served to logged-in team members (`GET /api/files/:id`). The public gets `401`.
- Photos and videos are served through `/api/media/:id/...`, which checks on every request that the item, its album and its year are all published. Anything hidden returns `404`.
- If saving a record fails, the files it uploaded are removed again.

## API overview

All endpoints live under `/api`, take and return JSON (uploads use `multipart/form-data`), and return errors as `{ "error": { "code", "message", "details?" } }`. Years appear in URLs (`/api/events/2026/expenses`).

- Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`, `GET /auth/me`, `PUT /auth/password`
- Team area: members, events (years), roster, budget, contributions, other income, expenses and proofs, categories, sarees, dashboard, trend, albums, media, files, activity, settings, `GET /stream` (live updates)
- Public: `/public/site`, `/public/events`, `/public/events/:year` and its `finance`, `sarees`, `gallery`, `videos`; `/public/albums/:id`; `/public/stream`

The full table with roles per endpoint is in [docs/ARCHITECTURE.md, section F](docs/ARCHITECTURE.md#f-api-structure).

## Testing

```bash
npm test          # 92 API tests (Vitest + Supertest) against the durgamatha_test database
npm run typecheck # server and client
```

The test run recreates `durgamatha_test` from the migrations each time. Set `TEST_DATABASE_URL` if your test database lives elsewhere. The tests cover, among other things:

- login, forged sessions, deactivated users, cross-site write requests;
- a member cannot make themselves admin, edit someone else's record, delete records, manage the budget or read the full audit log;
- the public cannot reach any private API or any payment proof;
- balance, budget and contribution status calculations, including edits and soft deletes;
- overselling sarees is blocked, including under concurrent sales;
- uploads with a fake extension are rejected; EXIF is stripped; hidden media stays hidden;
- public pages show only what the admin published;
- the audit log rejects UPDATE and DELETE at the database level (TRUNCATE is blocked too).

### End-to-end workflow

`e2e/workflows.mjs` drives a real browser through the main story: a member on a phone adds a ₹5,000 expense with a screenshot, the admin's dashboard on another device updates by itself, the screenshot is refused to a logged-out visitor, and uploaded photos stay hidden until the admin approves them. With `npm run seed` and `npm run dev` running:

```bash
cd e2e && npm install && npx playwright install chromium && npm test
```

## Deployment

**Quickest:** push this repository to GitHub, then in Render choose New, then Blueprint, and pick the repository. `render.yaml` creates the web service and a database, and asks for the admin email and password. The free plan's database expires after 30 days and uploads are lost on restart, so use the setup below for real use.

The simplest reliable setup is **one web service plus Supabase**:

1. Create a Supabase project. Use its PostgreSQL connection string (session pooler, port 5432) as `DATABASE_URL`, and set up storage as described above.
2. Create a Node web service (Render, Railway, Fly.io or a VPS) from this repository:
   - Build command: `npm ci && npm run build`
   - Start command: `npm start`
   - Environment: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN=https://your-domain`, `TRUST_PROXY=1`, and the `S3_*` variables with `STORAGE_DRIVER=s3`.
3. Migrations run automatically on start. Create the first admin once:
   ```bash
   ADMIN_NAME="..." ADMIN_EMAIL="..." ADMIN_PASSWORD="..." npm run seed:admin
   ```
4. Log in, create the year, set the roster and budget, and turn on the public flags when you are ready to publish.

In production, cookies are `Secure` and `SameSite=Lax`, security headers and a strict Content Security Policy are on, write requests from other origins are rejected, and the server serves the built React app from `client/dist`.

Backups: enable daily backups in Supabase (or `pg_dump` on a schedule). Uploaded files live in the bucket and are not in the database dump.

## Project structure

```
durgamatha/
├── client/               React app (Vite)
│   └── src/
│       ├── components/   UI kit, charts, media, file picker
│       ├── context/      Auth and selected year
│       ├── layouts/      Team app and public site layouts
│       ├── lib/          API client, queries, live updates, formatting
│       └── pages/        app/ (team area), public/ (website)
├── server/               Express API
│   ├── src/
│   │   ├── db/           Pool, migrations, seed scripts
│   │   ├── middleware/   Auth, validation, uploads, errors
│   │   ├── modules/      One folder per feature: routes + service
│   │   └── services/     Audit log, live updates, files, storage drivers, images
│   └── test/             API tests
├── e2e/                  Browser workflow check (Playwright)
└── docs/                 Architecture and phase notes
```
