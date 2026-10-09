import type { Client } from "@libsql/client";
import { ensureDbSchema, getDbClient } from "./db/client";
import { parseGitHubUsername } from "./githubInput";

const RUN_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRINT_RETENTION_MS = 7 * 24 * 3_600_000;
const BUCKET_RETENTION_MS = 3_600_000;
const COUNT_CACHE_MS = 60_000;

export interface PrintRecord {
  /** True when this call added exactly one receipt to the public total. */
  counted: boolean;
  /** Fresh total, or null when the store is unreachable. */
  total: number | null;
}

function validYear(year: unknown): year is number {
  return typeof year === "number" && Number.isInteger(year)
    && year >= 2008 && year <= new Date().getUTCFullYear();
}

/** Strict shape check shared by the route (400s) and recordPrint (silent no-ops). */
export function isValidPrintInput(input: unknown): input is {
  username?: string;
  year: number;
  runKey: string;
} {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const fields = input as { username?: unknown; year?: unknown; runKey?: unknown };
  if (fields.username !== undefined) {
    if (typeof fields.username !== "string") return false;
    if (fields.username.trim() !== "" && !parseGitHubUsername(fields.username)) return false;
  }
  if (!validYear(fields.year)) return false;
  return typeof fields.runKey === "string" && RUN_KEY_PATTERN.test(fields.runKey);
}

async function readCounter(active: Client): Promise<number | null> {
  try {
    const result = await active.execute({ sql: "SELECT value FROM counters WHERE name = 'prints'", args: [] });
    const value = Number((result.rows[0] as { value?: unknown } | undefined)?.value);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Counts one completed print. Replayed run keys are free but add nothing;
 * invalid input and database outages never throw (receipt UX must not depend
 * on telemetry).
 */
export async function recordPrint(input: {
  username?: unknown;
  year: unknown;
  runKey: unknown;
  ipHash: string;
}): Promise<PrintRecord> {
  if (!isValidPrintInput(input)) return { counted: false, total: null };
  const username = input.username?.trim() ? parseGitHubUsername(input.username)! : "demo";

  const db = getDbClient();
  if (!db) return { counted: false, total: null };
  try {
    await ensureDbSchema();
    const active = getDbClient();
    if (!active) return { counted: false, total: null };
    const now = Date.now();
    const [inserted] = await active.batch([
      {
        sql: "INSERT OR IGNORE INTO print_events(run_key, username, year, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [input.runKey, username, input.year, input.ipHash, now],
      },
      // changes() belongs to the preceding INSERT on this batch's connection.
      // A replay adds nothing. A failed counter write rolls the event back too,
      // so retrying the same key can still count the completed print.
      {
        sql: `INSERT INTO counters(name, value) SELECT 'prints', 1 WHERE changes() = 1
          ON CONFLICT(name) DO UPDATE SET value = counters.value + excluded.value`,
        args: [],
      },
      { sql: "DELETE FROM print_events WHERE created_at < ?", args: [now - PRINT_RETENTION_MS] },
      { sql: "DELETE FROM rate_limits WHERE window_start < ?", args: [now - BUCKET_RETENTION_MS] },
    ], "write");
    const total = await readCounter(active);
    cachedCount = { value: total, at: Date.now() };
    return { counted: Number(inserted.rowsAffected) === 1, total };
  } catch {
    return { counted: false, total: null };
  }
}

let cachedCount: { value: number | null; at: number } | null = null;

/** Public total, cached for a minute; null hides the counter instead of breaking the page. */
export async function getPrintCount(now: number = Date.now()): Promise<number | null> {
  if (cachedCount && now - cachedCount.at < COUNT_CACHE_MS) return cachedCount.value;
  const db = getDbClient();
  // Reads never create schema: a missing table simply means nothing printed yet.
  if (!db) {
    cachedCount = { value: null, at: now };
    return null;
  }
  const value = await readCounter(db);
  cachedCount = { value, at: now };
  return value;
}
