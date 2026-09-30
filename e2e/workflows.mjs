/**
 * End-to-end check of the core workflows from the brief, in a real browser:
 *   1. A team member on a phone logs in, taps +, adds a ₹5,000 expense with a
 *      payment screenshot.
 *   2. An admin's dashboard, open on another device, updates by itself (no reload).
 *   3. The member uploads photos from the phone; the admin approves them;
 *      the public gallery shows them.
 *   4. A logged-out visitor cannot open the payment screenshot.
 *
 * Needs: `npm run seed` and `npm run dev` running. Then: cd e2e && npm i && npm test
 * BASE_URL defaults to http://localhost:5173. CHROME can point at a Chromium binary.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const PASSWORD = 'durga2026';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const step = (s) => console.log(`• ${s}`);

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/app');
}
const money = async (page, label) => {
  const card = page.locator('.card', { has: page.getByText(label, { exact: true }) }).first();
  return Number((await card.locator('p.money').first().innerText()).replace(/[^\d-]/g, ''));
};

const png = await sharp({ create: { width: 400, height: 800, channels: 3, background: '#e8f5e9' } }).png().toBuffer();
const photo = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#f5b82e' } }).jpeg().toBuffer();

// Admin watches the dashboard on a laptop.
const adminCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const admin = await adminCtx.newPage();
await login(admin, 'admin@durgamatha.test');
await admin.getByText('Total expenses', { exact: true }).waitFor();
const before = await money(admin, 'Total expenses');
const balanceBefore = await money(admin, 'Current balance');
step(`admin dashboard: expenses ₹${before}, balance ₹${balanceBefore}`);

// Member on a phone.
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const phone = await phoneCtx.newPage();
await login(phone, 'ravi@durgamatha.test');
await phone.getByRole('button', { name: 'Add' }).last().tap();
await phone.getByRole('button', { name: /Add expense/ }).tap();
const dlg = phone.getByRole('dialog');
await dlg.getByPlaceholder('4000').fill('5000');
await dlg.locator('select').first().selectOption({ label: 'Decoration' });
await dlg.getByPlaceholder('Decoration materials').fill('E2E test: extra lights');
await dlg.locator('input[type=file][accept="image/*,application/pdf"]').first().setInputFiles({ name: 'payment.png', mimeType: 'image/png', buffer: png });
await dlg.getByRole('button', { name: 'Save expense' }).tap();
try {
  await phone.getByText('Expense added').waitFor({ timeout: 10000 });
} catch (e) {
  await phone.screenshot({ path: process.env.FAIL_SHOT ?? 'e2e-failure.png', fullPage: true });
  throw e;
}
step('member added ₹5,000 expense with screenshot from phone');

// The admin's dashboard must change on its own (SSE → refetch).
await admin.waitForFunction(
  (expected) => [...document.querySelectorAll('.card')].some((c) => c.textContent?.includes('Total expenses') && c.textContent.replace(/[^\d]/g, '').includes(String(expected))),
  before + 5000,
  { timeout: 10000 },
);
assert.equal(await money(admin, 'Total expenses'), before + 5000);
assert.equal(await money(admin, 'Current balance'), balanceBefore - 5000);
step('admin dashboard updated live without reload (expenses +₹5,000, balance −₹5,000)');

// Proof is private.
const proofUrl = await phone.evaluate(async () => {
  const list = await (await fetch('/api/events/2026/expenses?q=E2E')).json();
  const detail = await (await fetch(`/api/expenses/${list.items[0].id}`)).json();
  return `/api/files/${detail.expense.proofs[0].id}`;
});
const anon = await browser.newContext();
assert.equal((await anon.request.get(`${BASE}${proofUrl}`)).status(), 401);
assert.equal((await phoneCtx.request.get(`${BASE}${proofUrl}`)).status(), 200);
step('payment screenshot: 200 for team, 401 for the public');

// Photo upload from the phone.
await phone.goto(`${BASE}/app/photos?upload=1`);
await phone.locator('input[type=file][multiple]').setInputFiles([
  { name: 'e2e-1.jpg', mimeType: 'image/jpeg', buffer: photo },
  { name: 'e2e-2.jpg', mimeType: 'image/jpeg', buffer: photo },
]);
await phone.getByRole('button', { name: /^Upload 2/ }).tap();
await phone.getByText(/2 photos uploaded/).waitFor();
step('member uploaded 2 photos (pending approval)');

const pending = await admin.evaluate(async () => (await (await fetch('/api/events/2026/media?pending=1&type=photo')).json()).items.filter((m) => m.original_name.startsWith('e2e-')).map((m) => m.id));
assert.equal(pending.length, 2);
for (const id of pending) assert.equal((await anon.request.get(`${BASE}/api/media/${id}/thumb`)).status(), 404);
await admin.evaluate(async (ids) => {
  await fetch('/api/media/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, action: 'publish' }) });
}, pending);
for (const id of pending) assert.equal((await anon.request.get(`${BASE}/api/media/${id}/thumb`)).status(), 200);
step('hidden from public until admin approved; public after approval');

// Clean up the test expense so reruns start from the same numbers.
await admin.evaluate(async () => {
  const list = await (await fetch('/api/events/2026/expenses?q=E2E')).json();
  for (const e of list.items) await fetch(`/api/expenses/${e.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'e2e cleanup' }) });
  await fetch('/api/media/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: (await (await fetch('/api/events/2026/media?type=photo')).json()).items.filter((m) => m.original_name.startsWith('e2e-')).map((m) => m.id), action: 'delete' }) });
});
step('cleaned up test records');
await browser.close();
console.log('\nAll end-to-end workflow checks passed.');
