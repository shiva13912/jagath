import { config } from './config.js';
import { createApp } from './app.js';
import { migrate } from './db/migrate.js';

async function main() {
  // Apply pending migrations on boot so a fresh deploy is always in sync.
  await migrate(false);
  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`Durgamatha API listening on http://localhost:${config.PORT} (${config.NODE_ENV}, storage: ${config.STORAGE_DRIVER})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
