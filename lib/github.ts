import "server-only";

import { createSnapshotCache } from "./githubCache";
import { createGraphQLSnapshotLoader } from "./githubGraphql";
import { checkOutboundQuota } from "./rateLimit";
import { isQuotaStatus, hasQuotaErrorBody, RateLimitedError, contributionPeriod, normalizeYear, parseContributionCalendar, parseGitHubUsername } from "./githubInput";
import { demoSnapshot, outOfPaperSnapshot, receiptFromSnapshot, unavailableSnapshot } from "./receiptData";
import type { ContributionSnapshot, ReceiptData } from "./types";

export { normalizeYear, parseContributionCalendar, parseGitHubUsername, RateLimitedError, isQuotaStatus, hasQuotaErrorBody } from "./githubInput";
export { slowDownReceiptData } from "./receiptData";

const CACHE_SECONDS = 3600;
const lastKnownSnapshots = new Map<string, ContributionSnapshot>();
const getCachedSnapshot = createSnapshotCache();
const getGraphQLSnapshot = createGraphQLSnapshotLoader({ checkQuota: checkOutboundQuota });

function rememberSnapshot(snapshot: ContributionSnapshot): ContributionSnapshot {
  const key = `${snapshot.username.toLowerCase()}:${snapshot.year}`;
  lastKnownSnapshots.delete(key);
  lastKnownSnapshots.set(key, snapshot);
  if (lastKnownSnapshots.size > 128) {
    const oldest = lastKnownSnapshots.keys().next().value;
    if (oldest) lastKnownSnapshots.delete(oldest);
  }
  return snapshot;
}

function fetchedAt(response: Response): string {
  const timestamp = Date.parse(response.headers.get("date") || "");
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

async function fetchPublicSnapshot(username: string, year: number): Promise<ContributionSnapshot> {
  const period = contributionPeriod(year);
  const publicOptions = {
    headers: { "User-Agent": "Git-Receipts", "Accept-Language": "en-US,en;q=0.8" },
    next: { revalidate: CACHE_SECONDS },
    cache: "force-cache" as const,
    signal: AbortSignal.timeout(10_000),
  };
  const [calendarResult, profileResult] = await Promise.allSettled([
    fetch(`https://github.com/users/${encodeURIComponent(username)}/contributions?from=${period.periodStart}&to=${period.periodEnd}`, publicOptions),
    fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      ...publicOptions,
      headers: { ...publicOptions.headers, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    }),
  ]);
  if (calendarResult.status !== "fulfilled" || !calendarResult.value.ok) {
    // A 429 from the calendar host means the shared quota is empty, not that the profile is missing.
    // (Profile-detail failures stay non-fatal: calendar data remains useful without them.)
    const calendarResponse = calendarResult.status === "fulfilled" ? calendarResult.value : null;
    if (calendarResponse && isQuotaStatus(calendarResponse.status, calendarResponse.headers)) {
      throw new RateLimitedError();
    }
    throw new Error("Public GitHub calendar unavailable");
  }
  const html = await calendarResult.value.text();
  const days = parseContributionCalendar(html, period.periodStart, period.periodEnd);
  const expectedDays = Math.round((Date.parse(period.periodEnd) - Date.parse(period.periodStart)) / 86_400_000) + 1;
  // Incomplete markup is an upstream failure, not evidence of zero activity.
  if (days.length !== expectedDays) throw new Error("Public GitHub calendar is incomplete");
  let profile: { login?: string; name?: string | null; avatar_url?: string } | null = null;
  if (profileResult.status === "fulfilled" && profileResult.value.ok) {
    try { profile = await profileResult.value.json(); } catch { /* Calendar data remains useful without a profile. */ }
  }
  return {
    username: profile?.login || username,
    displayName: profile?.name || profile?.login || username,
    avatarUrl: profile?.avatar_url || null,
    year,
    source: "public",
    sourceMessage: "Public GitHub calendar. Commit, review, and pull request totals are not provided by this source.",
    available: true,
    rateLimited: false,
    fetchedAt: fetchedAt(calendarResult.value),
    ...period,
    days,
    repositories: [],
    totalContributions: days.reduce((sum, day) => sum + day.count, 0),
    totalCommits: null,
    pullRequests: null,
    reviews: null,
    issues: null,
    restrictedContributions: null,
  };
}

async function loadSnapshot(username: string, selectedYear: number): Promise<ContributionSnapshot> {
  // Either leg may hit an empty quota; a success on the other leg still wins.
  let quotaExceeded = false;
  const token = process.env.GH_PAT?.trim();
  if (token) {
    try {
      return rememberSnapshot(await getGraphQLSnapshot(username, selectedYear, token));
    } catch (error) {
      if (error instanceof RateLimitedError) quotaExceeded = true;
      // A token can expire or lack access; the public calendar remains available.
    }
  }
  try {
    if (!(await checkOutboundQuota())) throw new RateLimitedError("Shared GitHub quota guard tripped.");
    return rememberSnapshot(await fetchPublicSnapshot(username, selectedYear));
  } catch (error) {
    if (error instanceof RateLimitedError) quotaExceeded = true;
    // Quota exhaustion is explicit: the printer is out of paper, not silently stale.
    if (quotaExceeded) return outOfPaperSnapshot(username, selectedYear);
    const saved = lastKnownSnapshots.get(`${username.toLowerCase()}:${selectedYear}`);
    if (saved) return { ...saved, source: "fallback", sourceMessage: "GitHub is unavailable. Showing the last successful snapshot for this profile and year." };
    return unavailableSnapshot(username, selectedYear);
  }
}

/** Missing user selects the disclosed demo. A requested user never receives someone else's totals. */
export async function getReceiptData(year?: number, input?: string): Promise<ReceiptData> {
  const selectedYear = normalizeYear(year);
  if (!input?.trim()) return receiptFromSnapshot(demoSnapshot(selectedYear));
  const username = parseGitHubUsername(input);
  if (!username) return receiptFromSnapshot({
    ...unavailableSnapshot("invalid-profile", selectedYear),
    sourceMessage: "Enter a GitHub username or a github.com profile link.",
  });
  const periodEnd = contributionPeriod(selectedYear).periodEnd;
  const key = `${username.toLowerCase()}:${selectedYear}:${periodEnd}`;
  const snapshot = await getCachedSnapshot(key, () => loadSnapshot(username, selectedYear));
  return receiptFromSnapshot(snapshot);
}
