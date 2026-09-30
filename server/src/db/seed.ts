/**
 * Development seed: fake people, three event years, money, sarees, albums and
 * generated placeholder images. NEVER run against production (it refuses).
 *
 *   npm run seed            wipes app tables and reseeds
 *
 * All names, emails and phone numbers are invented.
 */
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { migrate } from './migrate.js';
import { pool } from './pool.js';
import { seedData } from './seedData.js';

if (config.isProd) {
  console.error('Refusing to seed a production database. Use `npm run seed:admin` instead.');
  process.exit(1);
}

export const DEV_PASSWORD = 'durga2026';

export const PEOPLE = [
  { name: 'Anil Sharma', email: 'admin@durgamatha.test', role: 'admin', phone: '+91 90000 10001' },
  { name: 'Ravi Kumar', email: 'ravi@durgamatha.test', role: 'member', phone: '+91 90000 10002' },
  { name: 'Shiva Prasad', email: 'shiva@durgamatha.test', role: 'member', phone: '+91 90000 10003' },
  { name: 'Kiran Reddy', email: 'kiran@durgamatha.test', role: 'member', phone: '+91 90000 10004' },
  { name: 'Suresh Naidu', email: 'suresh@durgamatha.test', role: 'member', phone: '+91 90000 10005' },
  { name: 'Priya Patel', email: 'priya@durgamatha.test', role: 'member', phone: '+91 90000 10006' },
  { name: 'Lakshmi Rao', email: 'lakshmi@durgamatha.test', role: 'member', phone: '+91 90000 10007' },
  { name: 'Mahesh Gupta', email: 'mahesh@durgamatha.test', role: 'member', phone: '+91 90000 10008' },
  { name: 'Deepa Iyer', email: 'deepa@durgamatha.test', role: 'member', phone: '+91 90000 10009' },
  { name: 'Venkat Rao', email: 'venkat@durgamatha.test', role: 'member', phone: '+91 90000 10010' },
] as const;

export type Ids = Record<string, number>;

export async function seedUsers(): Promise<Ids> {
  const hash = await bcrypt.hash(DEV_PASSWORD, 10);
  const ids: Ids = {};
  for (const p of PEOPLE) {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role, phone_public) VALUES ($1,$2,$3,$4,$5,FALSE) RETURNING id`,
      [p.name, p.email, p.phone, hash, p.role],
    );
    ids[p.name.split(' ')[0]!] = rows[0].id;
  }
  return ids;
}

async function wipe() {
  // Drop and recreate the schema: the audit log is append-only by design,
  // so a clean slate is the only honest way to reset development data.
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(false);
}

async function main() {
  await wipe();
  const ids = await seedUsers();
  await seedData(ids);
  console.log(`Seeded ${PEOPLE.length} users. Log in with admin@durgamatha.test / ${DEV_PASSWORD} (admin) or ravi@durgamatha.test / ${DEV_PASSWORD} (member).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
