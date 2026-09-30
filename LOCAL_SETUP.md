# Local setup on this machine

Notes specific to this checkout. The general instructions are in [README.md](README.md).

## Database

There was no local PostgreSQL, so it runs in Docker. Port **5433**, because
another project on this machine already holds 5432.

```bash
docker start durgamatha-pg
```

The container was created with (data lives in the `durgamatha-pgdata` volume, so
it survives restarts):

```bash
docker run -d --name durgamatha-pg --restart unless-stopped \
  -e POSTGRES_USER=durgamatha -e POSTGRES_PASSWORD=durgamatha -e POSTGRES_DB=durgamatha \
  -p 5433:5432 -v durgamatha-pgdata:/var/lib/postgresql/data postgres:16
```

The `durgamatha_test` database was created inside it for the test suite.

## Environment

`server/.env` exists already (from `.env.example`) with a generated `JWT_SECRET`
and `DATABASE_URL` pointing at port 5433. It is gitignored; do not commit it.

## Run

```bash
npm run dev
```

- Public site: http://localhost:5173
- Team area: http://localhost:5173/app
- API health: http://localhost:4000/api/health

Do **not** export a `PORT` variable in the shell you run this from. `dotenv` does
not override variables already present in the environment, so a stray `PORT` wins
over `server/.env` and the API tries to bind the same port as Vite.

## Tests

The test config defaults to port 5432, so pass the override:

```bash
TEST_DATABASE_URL="postgres://durgamatha:durgamatha@localhost:5433/durgamatha_test" npm test
```

## Seed data

`npm run seed` has been run: 10 fake users, years 2024/2025/2026, photos.
Sample videos were skipped because `ffmpeg` is not on the PATH (optional).

Logins (fake, development only): `admin@durgamatha.test` / `ravi@durgamatha.test`,
password `durga2026`.
