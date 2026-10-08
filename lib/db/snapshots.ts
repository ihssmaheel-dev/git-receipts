import "server-only";

import { ensureDbSchema, getDbClient } from "./client";
import type { ContributionSnapshot } from "../types";

const SUCCESS_TTL_MS = 3_600_000;

/** Durable key: profile + year (periodEnd is derived, not part of identity). */
export function durableSnapshotKey(username: string, year: number): string {
  return `${username.toLowerCase()}:${year}`;
}

function isSnapshot(value: unknown): value is ContributionSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.username === "string" &&
    typeof snapshot.year === "number" &&
    Array.isArray(snapshot.days) &&
    typeof snapshot.available === "boolean"
  );
}

/** Best-effort read; returns null on miss, expiry, corruption, or DB outage. */
export async function getStoredSnapshot(key: string): Promise<ContributionSnapshot | null> {
  const db = getDbClient();
  if (!db) return null;
  try {
    await ensureDbSchema();
    const active = getDbClient();
    if (!active) return null;
    const result = await active.execute({
      sql: "SELECT value, expires_at FROM snapshots WHERE key = ?",
      args: [key],
    });
    const row = result.rows[0] as { value?: unknown; expires_at?: unknown } | undefined;
    if (!row || typeof row.value !== "string") return null;
    const expiresAt = Number(row.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    const parsed: unknown = JSON.parse(row.value);
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Best-effort write; never throws (receipts must work without a database). */
export async function putStoredSnapshot(key: string, snapshot: ContributionSnapshot): Promise<void> {
  const db = getDbClient();
  if (!db) return;
  try {
    await ensureDbSchema();
    const active = getDbClient();
    if (!active) return;
    const retrySoon = !snapshot.available || snapshot.source === "fallback";
    // Unavailable snapshots are not worth persisting; they would poison recovery.
    if (retrySoon) return;
    const fetchedAt = Date.parse(snapshot.fetchedAt);
    const expiresAt = Number.isFinite(fetchedAt)
      ? Math.min(Date.now() + SUCCESS_TTL_MS, fetchedAt + SUCCESS_TTL_MS)
      : Date.now() + SUCCESS_TTL_MS;
    await active.execute({
      sql: "INSERT OR REPLACE INTO snapshots (key, value, fetched_at, expires_at) VALUES (?, ?, ?, ?)",
      args: [key, JSON.stringify(snapshot), snapshot.fetchedAt, expiresAt],
    });
  } catch {
    // Intentionally silent: file locks, read-only FS, or Turso outages fall back to memory.
  }
}
