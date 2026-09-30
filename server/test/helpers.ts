import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { pool, queryOne } from '../src/db/pool.js';

export const app = createApp();
export const api = () => request(app);

let migrated = false;
export async function setupDb() {
  if (!migrated) {
    await migrate(false);
    migrated = true;
  }
}

let counter = 0;
export async function createUser(role: 'admin' | 'member' = 'member', name?: string) {
  counter += 1;
  const email = `${role}${counter}-${Date.now()}@example.test`;
  const password = 'password123';
  const user = await queryOne(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role`,
    [name ?? `${role} ${counter}`, email, await bcrypt.hash(password, 4), role],
  );
  const res = await api().post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = res.headers['set-cookie'] as unknown as string[];
  return { ...user, email, password, cookie };
}

export { pool };

import sharp from 'sharp';

/** A real (tiny) PNG, so magic-byte validation passes. */
export async function pngBuffer(color = '#cc3a33', size = 32): Promise<Buffer> {
  return sharp({ create: { width: size, height: size, channels: 3, background: color } }).png().toBuffer();
}

export async function jpegBuffer(width = 800, height = 600): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#f5b82e' } }).jpeg().toBuffer();
}

export async function createEvent(admin: { cookie: string[] }, year: number, extra: Record<string, unknown> = {}) {
  const res = await api()
    .post('/api/events')
    .set('Cookie', admin.cookie)
    .send({ year, title: `Durgamatha ${year}`, defaultExpectedContribution: 5000, budget: 100000, ...extra });
  if (res.status !== 201) throw new Error(`createEvent failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.event;
}

export async function categoryId(name: string): Promise<number> {
  const row = await queryOne('SELECT id FROM expense_categories WHERE lower(name) = lower($1)', [name]);
  return row.id;
}
