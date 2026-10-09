import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type InArgs, type InStatement } from "@libsql/client";
import { ensureDbSchema, getDbClient } from "../lib/db/client";
import { checkLimit, checkOutboundQuota, clientIpHash, hashIp, limitFromEnv, rateLimitResponse } from "../lib/rateLimit";

// In-memory SQLite: exercises the shared Turso code path with zero files.
process.env.SQLITE_URL = "file::memory:";

function requestWithIp(ip: string | null): Request {
  const headers = new Headers();
  if (ip !== null) headers.set("x-forwarded-for", ip);
  return new Request("https://git-receipts.example/", { headers });
}

test("client addresses hash privately with last-proxy-wins semantics", () => {
  const direct = hashIp(null);
  assert.equal(hashIp(""), direct);
  assert.equal(hashIp("not an ip"), direct);
  assert.equal(hashIp("203.0.113.7, 70.41.3.18"), hashIp("70.41.3.18"));
  assert.notEqual(hashIp("203.0.113.7"), hashIp("203.0.113.8"));
  assert.notEqual(hashIp("::1"), direct);
  assert.equal(clientIpHash(requestWithIp(null)), direct);
  assert.equal(clientIpHash(requestWithIp("198.51.100.9")), hashIp("198.51.100.9"));
});

test("limits come from the environment with safe fallbacks", () => {
  assert.equal(limitFromEnv("RATE_LIMIT_MISSING_ENTRY", 30), 30);
  process.env.RATE_LIMIT_TEST_ENTRY = "5";
  assert.equal(limitFromEnv("RATE_LIMIT_TEST_ENTRY", 30), 5);
  process.env.RATE_LIMIT_TEST_ENTRY = "banana";
  assert.equal(limitFromEnv("RATE_LIMIT_TEST_ENTRY", 30), 30);
  process.env.RATE_LIMIT_TEST_ENTRY = "-2";
  assert.equal(limitFromEnv("RATE_LIMIT_TEST_ENTRY", 30), 30);
  delete process.env.RATE_LIMIT_TEST_ENTRY;
});

test("memory windows allow, block, and roll over deterministically", async () => {
  let now = 1_700_000_000_000;
  const check = (bucket: string) => checkLimit(bucket, { limit: 2, windowMs: 60_000, store: "memory", now: () => now });
  assert.equal((await check("probe:a")).allowed, true);
  assert.equal((await check("probe:a")).allowed, true);
  const blocked = await check("probe:a");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 60_000);
  assert.equal((await check("probe:b")).allowed, true);
  now += 60_000;
  assert.equal((await check("probe:a")).allowed, true);
});

test("abuse responses carry JSON, status, and retry guidance", async () => {
  const response = rateLimitResponse(90_000);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "90");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), { error: "Too many requests. Try again soon.", retryAfter: 90 });
  const floored = rateLimitResponse(0);
  assert.equal(floored.headers.get("Retry-After"), "1");
});

test("shared buckets hold across callers and roll over deterministically", async () => {
  let now = 1_700_000_000_000;
  const check = () => checkLimit("probe:shared", {
    limit: 2, windowMs: 60_000, store: "turso", now: () => now,
  });
  assert.equal((await check()).allowed, true);
  assert.equal((await check()).allowed, true);
  const blocked = await check();
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 60_000);
  now += 60_000;
  assert.equal((await check()).allowed, true);
});

test("a fresh shared window grants exactly one slot to 20 simultaneous requests", async () => {
  const now = 1_700_000_000_000;
  const results = await Promise.all(Array.from({ length: 20 }, () => checkLimit("probe:parallel-fresh", {
    limit: 1, windowMs: 60_000, store: "turso", now: () => now,
  })));
  assert.equal(results.filter((verdict) => verdict.allowed).length, 1);
  assert.ok(results.every((verdict) => verdict.retryAfterMs === 40_000));
  const db = getDbClient();
  assert.ok(db);
  const stored = await db.execute({ sql: 'SELECT "count" FROM rate_limits WHERE bucket = ?', args: ["probe:parallel-fresh"] });
  assert.equal(stored.rows[0].count, 1);
});

test("a shared rollover grants exactly the configured slots to 20 simultaneous requests", async () => {
  let now = 1_700_000_000_000;
  const check = () => checkLimit("probe:parallel-rollover", {
    limit: 3, windowMs: 60_000, store: "turso", now: () => now,
  });
  const first = await Promise.all(Array.from({ length: 20 }, check));
  assert.equal(first.filter((verdict) => verdict.allowed).length, 3);
  now += 60_000;
  const second = await Promise.all(Array.from({ length: 20 }, check));
  assert.equal(second.filter((verdict) => verdict.allowed).length, 3);
  assert.equal((await check()).allowed, false);
  const db = getDbClient();
  assert.ok(db);
  const stored = await db.execute({
    sql: 'SELECT "count", window_start FROM rate_limits WHERE bucket = ?', args: ["probe:parallel-rollover"],
  });
  assert.equal(stored.rows[0].count, 3);
  assert.equal(stored.rows[0].window_start, now - now % 60_000);
});

test("atomic reservations hold through independent SQLite connections", async (t) => {
  await ensureDbSchema();
  const db = getDbClient();
  assert.ok(db);
  const clients = Array.from({ length: 2 }, () => createClient({ url: "file::memory:?cache=shared" }));
  try {
    await clients[0].execute('CREATE TABLE rate_limits (bucket TEXT PRIMARY KEY, "count" INTEGER NOT NULL, window_start INTEGER NOT NULL)');
    let connection = 0;
    const mocked = t.mock.method(db, "execute", (statement: InStatement, args?: InArgs) => {
      const client = clients[connection++ % clients.length];
      return typeof statement === "string" ? client.execute(statement, args) : client.execute(statement);
    });
    let now = 1_700_000_000_000;
    const check = () => checkLimit("probe:cross-client", { limit: 4, windowMs: 60_000, now: () => now });
    for (let window = 0; window < 2; window += 1) {
      const results = await Promise.all(Array.from({ length: 20 }, check));
      assert.equal(results.filter((verdict) => verdict.allowed).length, 4);
      const stored = await clients[0].execute('SELECT "count", window_start FROM rate_limits WHERE bucket = \'probe:cross-client\'');
      assert.equal(stored.rows[0].count, 4);
      assert.equal(stored.rows[0].window_start, now - now % 60_000);
      now += 60_000;
    }
    mocked.mock.restore();
  } finally {
    t.mock.restoreAll();
    for (const client of clients) client.close();
  }
});

test("concurrent database failures enforce the latest memory fallback count", async (t) => {
  await ensureDbSchema();
  const db = getDbClient();
  assert.ok(db);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let waiting = 0;
  t.mock.method(db, "execute", async () => {
    waiting += 1;
    if (waiting === 20) release();
    await gate;
    throw new Error("Simulated database outage");
  });
  const results = await Promise.all(Array.from({ length: 20 }, () => checkLimit("probe:failure-fallback", {
    limit: 3, windowMs: 60_000, now: () => 1_700_000_000_000,
  })));
  assert.equal(waiting, 20);
  assert.equal(results.filter((verdict) => verdict.allowed).length, 3);
  assert.equal((await checkLimit("probe:failure-fallback", {
    limit: 3, windowMs: 60_000, store: "memory", now: () => 1_700_000_000_000,
  })).allowed, false);
});

test("cleanup failure does not turn an atomic grant into another reservation", async (t) => {
  await ensureDbSchema();
  const db = getDbClient();
  assert.ok(db);
  const execute = db.execute.bind(db);
  t.mock.method(db, "execute", (statement: InStatement, args?: InArgs) => {
    if (typeof statement !== "string" && statement.sql.startsWith("DELETE FROM rate_limits")) {
      throw new Error("Simulated cleanup failure");
    }
    return typeof statement === "string" ? execute(statement, args) : execute(statement);
  });
  const check = () => checkLimit("probe:cleanup-failure", {
    limit: 2, windowMs: 60_000, now: () => 1_700_000_000_000,
  });
  assert.equal((await check()).allowed, true);
  assert.equal((await check()).allowed, true);
  assert.equal((await check()).allowed, false);
});

test("an older request cannot reopen a newer shared window", async () => {
  const now = 1_700_000_000_000;
  assert.equal((await checkLimit("probe:out-of-order", { limit: 1, windowMs: 60_000, now: () => now + 60_000 })).allowed, true);
  assert.equal((await checkLimit("probe:out-of-order", { limit: 1, windowMs: 60_000, now: () => now })).allowed, false);
  assert.equal((await checkLimit("probe:out-of-order", { limit: 1, windowMs: 60_000, now: () => now + 60_000 })).allowed, false);
});

test("the shared outbound guard trips instead of burning the token quota", async () => {
  process.env.RATE_LIMIT_GITHUB_OUTBOUND = "2";
  try {
    assert.equal(await checkOutboundQuota(), true);
    assert.equal(await checkOutboundQuota(), true);
    assert.equal(await checkOutboundQuota(), false);
  } finally {
    delete process.env.RATE_LIMIT_GITHUB_OUTBOUND;
  }
});
