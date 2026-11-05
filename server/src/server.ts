// Boots the coach backend: opens the SQLite database, binds the request handler
// to a real HTTP server, and exposes a small lifecycle handle (used by both the
// CLI entry and the end-to-end verify harness).

import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { openServerDatabase, type ServerDb } from './db';
import { createApp } from './app';

/** Repo layout: compiled file lives at server/dist/server/src/, so `..`x3 = server/. */
const SERVER_ROOT = resolve(__dirname, '..', '..', '..');

export interface StartOptions {
  /** SQLite file path, or `:memory:` for an ephemeral database. */
  dbPath?: string;
  port?: number;
  host?: string;
  /** Static admin web directory; pass `null` to disable /admin. */
  adminDir?: string | null;
}

export interface CoachServer {
  db: ServerDb;
  server: Server;
  port: number;
  url: string;
  close(): Promise<void>;
}

/** Default on-disk database: server/data/coach-platform.db. */
export function defaultDbPath(): string {
  return resolve(SERVER_ROOT, 'data', 'coach-platform.db');
}

/** Default admin web root: server/public/admin. */
export function defaultAdminDir(): string {
  return resolve(SERVER_ROOT, 'public', 'admin');
}

/**
 * Starts the coach server and resolves once it is listening. Uses port 0 in
 * tests to grab an ephemeral port; `close()` tears down the socket and database.
 */
export function startCoachServer(options: StartOptions = {}): Promise<CoachServer> {
  const dbPath = options.dbPath ?? defaultDbPath();
  const db = openServerDatabase(dbPath);
  const adminDir = options.adminDir === undefined ? defaultAdminDir() : options.adminDir;
  const handler = createApp(db, { adminDir });
  const server = createServer(handler);

  return new Promise<CoachServer>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(options.port ?? 4000, options.host ?? '0.0.0.0', () => {
      const address = server.address();
      const port =
        typeof address === 'object' && address !== null ? address.port : (options.port ?? 4000);
      resolveListen({
        db,
        server,
        port,
        url: `http://localhost:${port}`,
        close: () =>
          new Promise<void>((resolveClose) => {
            server.close(() => {
              try {
                db.close();
              } catch {
                // Already closed.
              }
              resolveClose();
            });
          }),
      });
    });
  });
}
