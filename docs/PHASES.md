# Build log, phase by phase

Each phase was built, run and tested before the next one started. Each has its own git commit, so `git show <commit> --stat` lists exactly what changed. Setup and run commands are in the [README](../README.md); the design is in [ARCHITECTURE.md](ARCHITECTURE.md).

Common commands for every phase:

```bash
npm run seed    # fake data for 2024, 2025 and 2026 (development only)
npm run dev     # http://localhost:5173 and API on :4000
npm test        # API tests
```

Seeded logins: `admin@durgamatha.test` (admin) and `ravi@durgamatha.test` (member), password `durga2026`. All fake.

---

## Phase 1: Foundation (commit `1914f9f`)

**What was implemented**
- npm workspaces (`server`, `client`), strict TypeScript, environment validation with zod (the server refuses to start with a missing or weak secret).
- PostgreSQL migration runner and the first migration: `users`, `settings`, `activity_logs`, and the trigger that makes the audit log append-only.
- Authentication: login, logout, current user, change password. JWT in an httpOnly cookie; the user and role are reloaded from the database on every request. Login rate limiting, general API rate limiting, helmet security headers, and a same-origin check on every write request.
- Roles and member management: admin creates, edits, changes roles and deactivates members; members edit only their own profile; the last admin cannot be demoted or removed.
- `seed:admin` for bootstrapping the first real admin in production.
- React app shell: public layout and team app layout (sidebar on desktop, bottom navigation on phones), login page, route guards, the UI kit (buttons, fields, modals as bottom sheets on phones, badges, empty, loading and error states), members and profile pages.

**Files:** `package.json`, `.env.example`, `server/src/{config,app,index}.ts`, `server/src/db/*`, `server/src/middleware/*`, `server/src/modules/{auth,members}/*`, `server/src/services/{audit,realtime}.ts`, `client/` (scaffold, `components/ui/*`, `layouts/*`, `context/AuthContext.tsx`, `pages/Login.tsx`, `pages/app/{Members,Profile}.tsx`), `server/test/auth.test.ts`.

**Tested:** login success and failure (same message for wrong email and wrong password), cookie is httpOnly, forged tokens rejected, a deactivated user loses access immediately, a member cannot create accounts or make themselves admin, members don't see admin-only fields, audit log rejects UPDATE and DELETE.

## Phase 2: Finance (commit `fdfe7c0`)

**What was implemented**
- Migration `002_finance.sql`: events (years), roster (`event_members`), budgets, files, contributions, other income, expense categories (10 defaults), expenses, expense proofs.
- Migrations `003_sarees.sql` and `004_media.sql` were added in this phase too, because the finance service already folds saree totals into income and expenses and the dashboard shows recent media. Their screens and APIs came in phases 3 and 4.
- Years: create (with budget and roster), edit, soft delete (the admin must type the year to confirm), public visibility flags per year.
- Contributions with payment screenshots; status per member (Paid, Partial, Pending) is calculated from the roster, never stored.
- Expenses with any number of payment screenshots and bills, search, filters, sorting, pagination, detail view with edit history. Members edit their own; only admins delete (soft delete with a reason).
- Budget per category, other income, categories management.
- Private file storage: local driver for development, S3-compatible driver (Supabase Storage) for production. File type checked from the file's bytes. Proofs are served only to logged-in team members.
- The dashboard API (one consistent database snapshot) and the dashboard screen with the income/expense/balance cards, budget progress, contribution status, category and trend charts, recent activity.
- Live updates with Server-Sent Events: any change notifies every open dashboard, which refetches.
- Activity log screen (full for admins, limited feed for members), settings screen.

**Files:** `server/src/db/migrations/00{2,3,4}_*.sql`, `server/src/db/seedData.ts`, `server/src/modules/{events,finance,contributions,expenses,files,activity,settings}/*`, `server/src/services/{files.ts,storage/*}`, `server/src/middleware/upload.ts`, `client/src/pages/app/{Dashboard,Contributions,Expenses,Budget,EventsAdmin,Activity,Settings}.tsx`, `client/src/components/{charts/Charts,FilePicker,NoYear}.tsx`, `server/test/finance.test.ts`.

**Tested:** the worked example from the brief (₹50,000 in, ₹20,000 out gives ₹30,000; then +₹5,000 and −₹3,000 gives ₹32,000), edits and soft deletes recalculate, budget is separate from balance, a member cannot add a contribution for someone else or edit someone else's expense, only admins manage budget and categories, proofs are 401 to the public, disguised files are rejected, years never mix, expense filters and pagination.

## Phase 3: Sarees (commit `8e0bd01`)

**What was implemented**
- Saree purchases (quantity, unit cost, supplier) and sales (quantity, price, optional buyer note that is never public).
- Stock = purchased − sold, calculated live. Sales lock the year's row so two people selling the last saree at the same moment cannot oversell. Editing a sale or purchase cannot push stock below zero.
- Purchase cost counts as an expense (category "Sarees"), sales count as income, so the dashboard balance includes them.
- Sarees screen with summary, purchases, sales and a year-by-year history.

**Files:** `server/src/modules/sarees/sarees.routes.ts`, `client/src/pages/app/Sarees.tsx`, `server/test/sarees.test.ts`.

**Tested:** totals, stock after sales, overselling refused, concurrent sales cannot oversell, edits keep stock valid, validation, yearly history.

## Phase 4: Photos and videos (commit `844eff3`)

**What was implemented**
- Albums per year; upload up to 20 photos or videos at once from a phone, with progress.
- Photos are auto-rotated, stripped of EXIF and GPS location, and get a small WebP thumbnail.
- Member uploads wait for admin approval (or publish automatically if the admin turns that on in settings). Admins can publish, hide, feature or delete in bulk.
- Media is served through the API, which checks on every request that the item, its album and its year are all public. Hidden items return 404 to the public.
- Photo grid with lightbox (swipe on phones), video list with an inline player, downloads when allowed.

**Files:** `server/src/modules/media/*`, `server/src/services/images.ts`, `server/src/db/seedMedia.ts`, `client/src/components/media/{UploadDialog,Lightbox}.tsx`, `client/src/pages/app/{Photos,Videos}.tsx`, `server/test/media.test.ts`.

**Tested:** album permissions, multi-photo upload with thumbnails, EXIF/GPS stripped, unapproved media invisible to the public, members cannot publish, bulk approval, hiding an album or unpublishing a year hides its media at once, download setting honoured, disguised video files rejected.

## Phase 5: Public website (commit `40a0e41`)

**What was implemented**
- Public pages: home (current year, highlights, featured photos), all years, a page per year, gallery, album, videos, finance summary, saree summary, about and team.
- Every public endpoint returns only whitelisted fields for published years. The admin chooses per year whether to show finance at all, contributor names, the expense list and saree sales. Members who opted out appear anonymously. Proofs, phone numbers (unless marked public), buyer notes and uploader identities are never exposed.
- Public live stream so the finance page updates on its own.

**Files:** `server/src/modules/public/public.routes.ts`, `client/src/layouts/PublicLayout.tsx`, `client/src/pages/public/*`, `client/src/components/media/PublicGrid.tsx`, `server/test/public.test.ts`.

**Tested:** only published years listed, aggregates only by default, names and expense lists only when enabled and still without proofs, opted-out members anonymous, hiding finance hides the numbers, saree sales without buyer names, gallery without uploader identity, contact details only when public.

## Phase 6: Polish and verification (commit `548c197` and the docs commit after it)

**What was implemented**
- A browser end-to-end check (`e2e/workflows.mjs`) of the main story on a phone-sized screen: a member adds a ₹5,000 expense with a screenshot, the admin's dashboard on another device updates without a reload (expenses +₹5,000, balance −₹5,000), the screenshot is 200 for the team and 401 for the public, uploaded photos are hidden until the admin approves them.
- `GET /api/auth/session` so the public site can check for a login without logging an error.
- Chart legend always lists Income before Expenses; video thumbnails show a real frame on phones.
- Production mode: unknown `/assets/*` files return 404 instead of the app page.
- README (setup, environment, storage, API, tests, deployment) and this file.

**Verified**
- `npm test`: 92 API tests pass (auth 19, finance 23, sarees 8, media 12, public 30).
- `npm run typecheck`: server and client clean.
- `e2e`: all workflow checks pass.
- `npm run build` then `NODE_ENV=production npm start`: the API and the built app are served from one process; login, dashboard and public pages work; write requests from another origin are refused (403); security headers and CSP are present.

**Security review notes**
- Every permission is checked in the API; the React route guards are only for convenience.
- No secrets in the code or the repository; `server/.env` is gitignored and `.env.example` has empty values.
- SQL is parameterised everywhere; request bodies are validated with strict zod schemas (unknown fields such as `role` on a profile update are rejected).
- Files are private, typed by content, stored under random keys, and removed again if the record fails to save.
- Soft deletes plus an append-only audit log with before/after values mean nothing financial is silently overwritten.
- Known limits, deliberately not built (to avoid over-engineering): no password-reset email (the admin resets passwords), no virus scanning of uploads, no video transcoding (phones' MP4 plays as uploaded).
