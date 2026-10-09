import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import { createSnapshotCache } from "../lib/githubCache";
import { RateLimitedError } from "../lib/githubInput";
import { outOfPaperSnapshot } from "../lib/receiptData";

interface StoredSnapshot {
  kind: string;
  data: { body: string };
  revalidate: number;
}

/** Real unstable_cache wrapper, isolated from its disk/remote cache transport. */
class MemoryNextCache {
  readonly entries = new Map<string, StoredSnapshot>();
  readonly invocationKeys: string[] = [];
  async generateSimpleCacheKey(input: string) {
    this.invocationKeys.push(input);
    return createHash("sha256").update(input).digest("hex");
  }
  async get(key: string) {
    const value = this.entries.get(key);
    return value ? { value, isStale: false } : null;
  }
  async set(key: string, value: StoredSnapshot) { this.entries.set(key, value); }
}

async function setup(t: TestContext) {
  const globals = globalThis as unknown as {
    AsyncLocalStorage?: typeof AsyncLocalStorage;
    __incrementalCache?: MemoryNextCache;
  };
  const originalStorage = globals.AsyncLocalStorage;
  const originalCache = globals.__incrementalCache;
  globals.AsyncLocalStorage = AsyncLocalStorage;
  const cache = new MemoryNextCache();
  globals.__incrementalCache = cache;
  t.after(() => {
    globals.AsyncLocalStorage = originalStorage;
    globals.__incrementalCache = originalCache;
  });
  // Next initializes its async storage during import; it normally receives this
  // runtime global from the Next server, which node:test does not start.
  const { createGraphQLSnapshotLoader } = await import("../lib/githubGraphql");
  return { cache, createGraphQLSnapshotLoader };
}

function successBody(periodEnd = "2026-01-02") {
  const length = Math.round((Date.parse(periodEnd) - Date.parse("2026-01-01")) / 86_400_000) + 1;
  return {
    data: { user: {
      login: "Octocat", name: "Octocat", avatarUrl: "https://avatars.githubusercontent.com/u/1",
      contributionsCollection: {
        totalCommitContributions: length, totalPullRequestContributions: 0,
        totalPullRequestReviewContributions: 0, totalIssueContributions: 0, restrictedContributionsCount: 1,
        contributionCalendar: { totalContributions: length, weeks: [{ contributionDays:
          Array.from({ length }, (_, index) => ({ date: new Date(Date.parse("2026-01-01")
            + index * 86_400_000).toISOString().slice(0, 10), contributionCount: 1 })) }] },
        commitContributionsByRepository: [{
          repository: { nameWithOwner: "employer/secret-repo", isPrivate: true, url: "https://github.com/employer/secret-repo" },
          contributions: { totalCount: 1 },
        }],
      },
    } },
  };
}

test("HTTP 200 quota errors retry after one minute, while validated success persists across local caches", async (t) => {
  const { cache, createGraphQLSnapshotLoader } = await setup(t);
  let timestamp = Date.parse("2026-01-02T12:00:00Z");
  let requests = 0;
  let quotaChecks = 0;
  const token = "fake-secret-token-for-cache-test";
  const getSnapshot = createGraphQLSnapshotLoader({
    now: () => timestamp,
    checkQuota: async () => { quotaChecks += 1; return true; },
    request: async (_url, options) => {
      requests += 1;
      assert.equal(options?.cache, "no-store");
      assert.equal((options as RequestInit & { next?: unknown }).next, undefined);
      return Response.json(requests === 1
        ? { errors: [{ type: "RATE_LIMITED", message: "Quota is exhausted" }] }
        : successBody(), { headers: { Date: new Date(timestamp).toUTCString(), "x-ratelimit-remaining": "0" } });
    },
  });
  const load = async () => {
    try { return await getSnapshot("octocat", 2026, token); }
    catch (error) {
      assert.ok(error instanceof RateLimitedError);
      return outOfPaperSnapshot("octocat", 2026);
    }
  };
  const localCache = createSnapshotCache({ now: () => timestamp });
  assert.equal((await localCache("octocat:2026", load)).rateLimited, true);
  assert.equal(cache.entries.size, 0, "A successful HTTP status must not persist a GraphQL error");
  timestamp += 59_999;
  assert.equal((await localCache("octocat:2026", load)).rateLimited, true);
  assert.equal(requests, 1);
  timestamp += 1;
  const success = await localCache("octocat:2026", load);
  assert.equal(success.available, true);
  assert.equal(success.rateLimited, false, "Successful data remains usable with remaining quota zero");
  assert.equal(success.totalContributions, 2);
  assert.equal(cache.entries.size, 1);
  assert.equal([...cache.entries.values()][0].revalidate, 3600);
  const otherLocalCache = createSnapshotCache({ now: () => timestamp });
  assert.deepEqual(await otherLocalCache("octocat:2026", load), success);
  assert.equal(requests, 2, "The validated Next snapshot serves a different instance's cold memory cache");
  assert.equal(quotaChecks, 2, "Cache hits do not consume the outbound guard");
  assert.ok(cache.invocationKeys.every((key) => !key.includes(token)));
  assert.ok([...cache.entries.values()].every((entry) => !entry.data.body.includes("employer/secret-repo")));
});

test("malformed and GraphQL-error payloads never enter the successful snapshot cache", async (t) => {
  const { cache, createGraphQLSnapshotLoader } = await setup(t);
  const incomplete = successBody();
  incomplete.data.user.contributionsCollection.contributionCalendar.weeks[0].contributionDays.pop();
  const bodies = [null, { errors: [{ message: "Access denied" }] }, { data: { user: null } }, incomplete];
  const getSnapshot = createGraphQLSnapshotLoader({
    now: () => Date.parse("2026-01-02T12:00:00Z"),
    checkQuota: async () => true,
    request: async () => Response.json(bodies.shift()),
  });
  for (let index = 0; index < 4; index += 1) {
    await assert.rejects(getSnapshot("octocat", 2026, "fake-token"));
    assert.equal(cache.entries.size, 0);
  }
});

test("an expired success cannot hide quota failure, and token/date changes invalidate validated cache keys", async (t) => {
  const { cache, createGraphQLSnapshotLoader } = await setup(t);
  let timestamp = Date.parse("2026-01-02T23:00:00Z");
  let allowQuota = true;
  let requests = 0;
  const getSnapshot = createGraphQLSnapshotLoader({
    now: () => timestamp,
    checkQuota: async () => allowQuota,
    request: async () => {
      requests += 1;
      const periodEnd = new Date(timestamp).toISOString().slice(0, 10);
      return Response.json(successBody(periodEnd), { headers: { Date: new Date(timestamp).toUTCString() } });
    },
  });
  await getSnapshot("octocat", 2026, "token-one");
  await getSnapshot("OCTOCAT", 2026, "token-one");
  assert.equal(requests, 1);
  await getSnapshot("octocat", 2026, "token-two");
  assert.equal(requests, 2);
  timestamp += 3_600_000;
  allowQuota = false;
  await assert.rejects(getSnapshot("octocat", 2026, "token-one"), RateLimitedError);
  assert.equal(requests, 2, "A rejected guard must not perform a GitHub request");
  assert.equal(cache.entries.size, 2, "The failed new-hour lookup must not write a cache entry");
  allowQuota = true;
  const nextDay = await getSnapshot("octocat", 2026, "token-one");
  assert.equal(nextDay.periodEnd, "2026-01-03");
  assert.equal(nextDay.totalContributions, 3);
  assert.equal(requests, 3);
});
