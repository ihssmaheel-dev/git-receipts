import type { ContributionSnapshot } from "./types";

/** Bound memory usage and share a single lookup across concurrent image/page requests. */
export function createSnapshotCache({
  successTtlMs = 3_600_000,
  retryTtlMs = 60_000,
  maxEntries = 128,
  now = Date.now,
}: {
  successTtlMs?: number;
  retryTtlMs?: number;
  maxEntries?: number;
  now?: () => number;
} = {}) {
  const snapshots = new Map<string, { value: ContributionSnapshot; expiresAt: number }>();
  const pending = new Map<string, Promise<ContributionSnapshot>>();

  return async function getCachedSnapshot(
    key: string,
    load: () => Promise<ContributionSnapshot>,
  ): Promise<ContributionSnapshot> {
    const cached = snapshots.get(key);
    if (cached && cached.expiresAt > now()) return cached.value;
    if (cached) snapshots.delete(key);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const request = Promise.resolve().then(load).then((snapshot) => {
      const timestamp = now();
      const retrySoon = !snapshot.available || snapshot.source === "fallback";
      const fetchedAt = Date.parse(snapshot.fetchedAt);
      // Do not restart an hour of freshness when Next returns an already cached response.
      const expiresAt = retrySoon
        ? timestamp + retryTtlMs
        : Math.min(timestamp + successTtlMs, Number.isFinite(fetchedAt) ? fetchedAt + successTtlMs : timestamp + successTtlMs);
      snapshots.set(key, { value: snapshot, expiresAt });
      if (snapshots.size > maxEntries) {
        const oldest = snapshots.keys().next().value;
        if (oldest) snapshots.delete(oldest);
      }
      return snapshot;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
