import "server-only";

import { createClient, type Client } from "@libsql/client";

/**
 * Unified SQLite client: local `.db` file in development, Turso Cloud in production.
 *
 * - Local:  SQLITE_URL=file:./data/cache.db (default), no token needed.
 * - Prod:   TURSO_DATABASE_URL=libsql://... + TURSO_AUTH_TOKEN=...
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
  // fall back to in-memory caching instead of crashing on file writes.
  if (process.env.VERCEL) return null;

  return process.env.SQLITE_URL?.trim() || "file:./data/cache.db";
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
    warnOnce("SQLite client creation failed; using in-memory cache only.", error);
    client = null;
  }
  return client;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS snapshots (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_expires_at ON snapshots(expires_at);
`;

export function ensureDbSchema(): Promise<void> {
  const db = getDbClient();
  if (!db) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = db.executeMultiple(SCHEMA_SQL).catch((error) => {
      // A read-only filesystem or unreachable Turso must never break receipts.
      warnOnce("Snapshot table setup failed; using in-memory cache only.", error);
      client = null;
    });
  }
  return schemaReady;
}

export function isDbConfigured(): boolean {
  return getDbClient() !== null;
}
