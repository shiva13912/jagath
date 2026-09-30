import pg from 'pg';

/**
 * Recreates the test database from scratch before the suite runs, so tests
 * always start from the migrations alone. Requires the DB user to have CREATEDB.
 */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgres://durgamatha:durgamatha@localhost:5432/durgamatha_test');
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error('Refusing to reset a database whose name does not end in _test');
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();
}
