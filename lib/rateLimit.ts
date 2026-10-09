import { createHash } from "node:crypto";
import { ensureDbSchema, getDbClient } from "./db/client";

export interface LimitVerdict {
  allowed: boolean;
  retryAfterMs: number;
}

interface WindowState {
  count: number;
  windowStart: number;
  windowMs: number;
}

/** Best-effort per-instance mirror; Turso stays authoritative across instances. */
const memoryBuckets = new Map<string, WindowState>();

const DEV_SALT = "git-receipts-dev-salt";
let saltWarned = false;
let dbWarned = false;

function salt(): string {
  const configured = process.env.RATE_LIMIT_SALT?.trim();
  if (configured) return configured;
  if (process.env.VERCEL && !saltWarned) {
    saltWarned = true;
    console.warn("[abuse] RATE_LIMIT_SALT is unset; IP hashes use a public constant. Set a random salt in production.");
  }
  return DEV_SALT;
}

/** Closest valid address in X-Forwarded-For; "direct" when absent or malformed.
 * The rightmost entry is appended by the closest trusted hop (our host);
 * entries to its left are sender-controlled and must never grant buckets. */
export function hashIp(forwardedFor: string | null): string {
  const entries = (forwardedFor ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  let candidate = "";
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(entries[index]) || /^[0-9a-fA-F:.]+$/.test(entries[index])) {
      candidate = entries[index];
      break;
    }
  }
  const ip = candidate || "direct";
  return createHash("sha256").update(`${salt()}:${ip}`).digest("hex");
}

/** Convenience wrapper for Request handlers. */
export function clientIpHash(request: Request): string {
  return hashIp(request.headers.get("x-forwarded-for"));
}

export function limitFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sweepMemory(now: number): void {
  if (memoryBuckets.size <= 10_000) return;
  for (const [key, state] of memoryBuckets) {
    if (state.windowStart + state.windowMs < now) memoryBuckets.delete(key);
  }
}

function rememberWindow(bucket: string, state: WindowState): void {
  const current = memoryBuckets.get(bucket);
  // Database replies can finish out of order. Never lower a known count or
  // replace a newer window with a delayed reply from its predecessor.
  if (!current || current.windowStart < state.windowStart) {
    memoryBuckets.set(bucket, state);
  } else if (current.windowStart === state.windowStart && current.count < state.count) {
    memoryBuckets.set(bucket, state);
  }
}

function consumeMemory(bucket: string, windowStart: number, windowMs: number, timestamp: number, limit: number): boolean {
  // Read at reservation time, including after an asynchronous database failure.
  const current = memoryBuckets.get(bucket);
  if (current && current.windowStart > windowStart) return false;
  const count = current?.windowStart === windowStart ? current.count : 0;
  if (count >= limit) return false;
  memoryBuckets.set(bucket, { count: count + 1, windowStart, windowMs });
  sweepMemory(timestamp);
  return true;
}

/**
 * Fixed-window gate. `memory` is instant and per-instance; `turso` consults the
 * shared bucket table so limits hold across serverless instances.
 * Degraded databases use the per-instance mirror without breaking receipts.
 */
export async function checkLimit(
  bucket: string,
  options: { limit: number; windowMs: number; store?: "memory" | "turso"; now?: () => number },
): Promise<LimitVerdict> {
  const { limit, windowMs, store = "turso", now = Date.now } = options;
  const timestamp = now();
  const windowStart = timestamp - (timestamp % windowMs);
  const retryAfterMs = windowStart + windowMs - timestamp;

  const mirror = memoryBuckets.get(bucket);
  if (mirror && mirror.windowStart === windowStart && mirror.count >= limit) {
    return { allowed: false, retryAfterMs };
  }

  if (store === "memory") {
    return { allowed: consumeMemory(bucket, windowStart, windowMs, timestamp, limit), retryAfterMs };
  }

  try {
    const db = getDbClient();
    if (!db) throw new Error("Database is not configured.");
    await ensureDbSchema();
    const active = getDbClient();
    if (!active) throw new Error("Database is not configured.");
    // SQLite serializes this reservation as one write. A read followed by a
    // separate increment lets concurrent callers spend the same final slot.
    const reservation = await active.execute({
      sql: `INSERT INTO rate_limits(bucket, "count", window_start) VALUES (?, 1, ?)
        ON CONFLICT(bucket) DO UPDATE SET
          "count" = CASE WHEN rate_limits.window_start = excluded.window_start
            THEN rate_limits."count" + 1 ELSE 1 END,
          window_start = excluded.window_start
        WHERE rate_limits.window_start < excluded.window_start
          OR (rate_limits.window_start = excluded.window_start AND rate_limits."count" < ?)
        RETURNING "count", window_start`,
      args: [bucket, windowStart, limit],
    });
    const row = reservation.rows[0];
    const allowed = row !== undefined;
    const count = allowed ? Number(row.count) : limit;
    rememberWindow(bucket, { count, windowStart, windowMs });
    sweepMemory(timestamp);

    if (allowed && count === 1) {
      // Cleanup is telemetry maintenance, not part of the reservation. Failure
      // must not consume another memory slot or change an already-issued grant.
      try {
        await active.execute({
          sql: "DELETE FROM rate_limits WHERE window_start < ?",
          args: [windowStart - 3_600_000],
        });
      } catch {
        // Retry cleanup when another bucket starts a new window.
      }
    }
    return { allowed, retryAfterMs };
  } catch {
    if (!dbWarned) {
      dbWarned = true;
      console.warn("[abuse] Rate-limit store unreachable; enforcing per-instance memory limits only.");
    }
    return { allowed: consumeMemory(bucket, windowStart, windowMs, timestamp, limit), retryAfterMs };
  }
}

/**
 * Shared outbound guard: caps GitHub fetches per minute so one abuser cannot
 * burn the token quota for everyone. Tripping it renders OUT OF PAPER.
 */
export async function checkOutboundQuota(): Promise<boolean> {
  const verdict = await checkLimit("github-out", {
    limit: limitFromEnv("RATE_LIMIT_GITHUB_OUTBOUND", 120),
    windowMs: 60_000,
    store: "turso",
  });
  return verdict.allowed;
}

export function rateLimitResponse(retryAfterMs: number, message = "Too many requests. Try again soon."): Response {
  const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return Response.json({ error: message, retryAfter }, {
    status: 429,
    headers: { "Retry-After": String(retryAfter), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
  });
}
