import assert from "node:assert/strict";
import test from "node:test";
import { checkLimit, checkOutboundQuota, clientIpHash, hashIp, limitFromEnv, rateLimitResponse } from "../lib/rateLimit";

// In-memory SQLite: exercises the shared Turso code path with zero files.
process.env.SQLITE_URL = "file::memory:";

function requestWithIp(ip: string | null): Request {
  const headers = new Headers();
  if (ip !== null) headers.set("x-forwarded-for", ip);
  return new Request("https://commit-printer.example/", { headers });
}

test("client addresses hash privately with first-proxy-wins semantics", () => {
  const direct = hashIp(null);
  assert.equal(hashIp(""), direct);
  assert.equal(hashIp("not an ip"), direct);
  assert.equal(hashIp("203.0.113.7"), hashIp("203.0.113.7, 70.41.3.18"));
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
