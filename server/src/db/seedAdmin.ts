import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { migrate } from './migrate.js';
import { pool, queryOne } from './pool.js';

/**
 * Creates the first admin from ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD.
 * Safe to run repeatedly: does nothing if that email already exists.
 * Use this in production instead of the development seed.
 */
async function main() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = config;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first');
  if (ADMIN_PASSWORD.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');
  await migrate(false);
  const existing = await queryOne('SELECT id FROM users WHERE lower(email) = lower($1)', [ADMIN_EMAIL]);
  if (existing) {
    console.log(`Admin ${ADMIN_EMAIL} already exists, nothing to do.`);
    return;
  }
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`, [
    ADMIN_NAME || 'Admin',
    ADMIN_EMAIL,
    hash,
  ]);
  console.log(`Created admin ${ADMIN_EMAIL}. Log in and change the password from your profile.`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
