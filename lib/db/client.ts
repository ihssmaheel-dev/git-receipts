import { createClient, type Client } from "@libsql/client";

/** NOTE: deliberately no `server-only` import so unit tests can exercise this
 * module. tests/serverOnly.test.ts fails CI if any `"use client"` file ever
 * imports the database, counter, limiter, or fetcher modules. */

/**
 * Unified SQLite client: local `.db` file in development, Turso Cloud in production.
 *
 * - Local:  SQLITE_URL=file:./data/app.db (default), no token needed.
 * - Prod:   TURSO_DATABASE_URL=libsql://... + TURSO_AUTH_TOKEN=...
 *
 * The database holds abuse telemetry only: the public print counter, one row
 * per counted print (for exactly-once run keys), and rate-limit buckets.
 * Receipt snapshots are NEVER cached here; they stay in memory + HTTP cache.
 *
 * Single driver (`@libsql/client`) covers both. Do NOT use
 * `@tursodatabase/serverless/compat` here: that package is not installed,
 * does not support `file:` URLs, and breaks `next build` with
 * "Module not found: Can't resolve '@tursodatabase/serverless/compat'".
 *
 * Never import from `scripts/` in app code; this module lives under `lib/`
 * so Server Components can safely trace it.
 */

function resolveDatabaseUrl(): string | null {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  if (tursoUrl) return tursoUrl;

  // Vercel's filesystem is read-only except /tmp. Without Turso configured,
  // fall back to memory-only behavior instead of crashing on file writes.
  if (process.env.VERCEL) return null;

  return process.env.SQLITE_URL?.trim() || "file:./data/app.db";
}

function isRemoteUrl(url: string): boolean {
  return url.startsWith("libsql://") || url.startsWith("https://");
}

let client: Client | null | undefined;
let schemaReady: Promise<void> | null = null;
let warned = false;

function warnOnce(message: string, error: unknown) {
  if (warned) return;
  warned = true;
  console.warn(`[db] ${message}`, error instanceof Error ? error.message : error);
}

export function getDbClient(): Client | null {
  if (client !== undefined) return client;
  const url = resolveDatabaseUrl();
  if (!url) {
    client = null;
    return client;
  }
  try {
    client = isRemoteUrl(url)
      ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN?.trim() })
      : createClient({ url });
  } catch (error) {
    warnOnce("SQLite client creation failed; running without abuse telemetry.", error);
    client = null;
  }
  return client;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS print_events (
  run_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  year INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_print_events_created ON print_events(created_at);
CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO counters(name, value) VALUES ('prints', 0);
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  "count" INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
DROP TABLE IF EXISTS snapshots;
`;

export function ensureDbSchema(): Promise<void> {
  const db = getDbClient();
  if (!db) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = db.executeMultiple(SCHEMA_SQL).catch((error) => {
      // A read-only filesystem or unreachable Turso must never break receipts.
      warnOnce("Counter table setup failed; running without abuse telemetry.", error);
      client = null;
    });
  }
  return schemaReady;
}

export function isDbConfigured(): boolean {
  return getDbClient() !== null;
}

/** Releases the underlying handle so test processes exit without open files. */
export function closeDbClient(): void {
  schemaReady = null;
  const active = client;
  client = undefined;
  if (active) {
    try {
      active.close();
    } catch {
      // Closing is best-effort; the next call recreates the client.
    }
  }
}
