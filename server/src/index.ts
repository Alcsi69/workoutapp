// CLI entry point: `npm start` (after `npm run build`) boots the coach backend.
//
//   PORT=4000 HOST=0.0.0.0 npm start
//
// Serves the REST API under /api and the coach admin web at /admin from the same
// process — no second port, no second process.

import { startCoachServer, defaultDbPath } from './server';

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? '0.0.0.0';
  const server = await startCoachServer({ port, host });

  console.log('WorkoutApp coach server fut.');
  console.log(`  API     : ${server.url}/api`);
  console.log(`  Admin   : ${server.url}/admin  (0.0.0.0:${server.port})`);
  console.log(`  Adatbázis: ${defaultDbPath()}`);
  if (process.env.ADMIN_TOKEN === undefined || process.env.ADMIN_TOKEN.trim().length === 0) {
    console.log(`  Admin token (ADMIN_TOKEN nincs beállítva): ${server.adminToken}`);
  }

  const shutdown = (): void => {
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((cause: unknown) => {
  console.error('A szerver indítása sikertelen:', cause);
  process.exitCode = 1;
});
