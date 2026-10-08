import "server-only";

import fallback from "../data/fallback.json";
import { createSnapshotCache } from "./githubCache";
import { durableSnapshotKey, getStoredSnapshot, putStoredSnapshot } from "./db/snapshots";
import { contributionPeriod, normalizeYear, parseContributionCalendar, parseGitHubUsername } from "./githubInput";
import { buildReceiptLines } from "./receiptLines";
import { calculateStats, normalizeDays } from "./stats";
import type { ContributionSnapshot, ReceiptData, RepositorySummary } from "./types";

export { normalizeYear, parseContributionCalendar, parseGitHubUsername } from "./githubInput";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const CACHE_SECONDS = 3600;
const lastKnownSnapshots = new Map<string, ContributionSnapshot>();
const getCachedSnapshot = createSnapshotCache();

const contributionsQuery = `
  query CommitPrinter($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      login
      name
      avatarUrl
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        totalIssueContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
        commitContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner isPrivate url }
          contributions(first: 1) { totalCount }
        }
      }
    }
  }
`;

interface GraphQLUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  contributionsCollection: {
    totalCommitContributions: number;
    totalPullRequestContributions: number;
    totalPullRequestReviewContributions: number;
    totalIssueContributions: number;
    restrictedContributionsCount: number;
    contributionCalendar: {
      totalContributions: number;
      weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
    };
    commitContributionsByRepository: {
      repository: { nameWithOwner: string; isPrivate: boolean; url: string };
      contributions: { totalCount: number };
    }[];
  };
}

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

function receiptFromSnapshot(snapshot: ContributionSnapshot): ReceiptData {
  const stats = calculateStats(snapshot);
  return { snapshot, stats, lines: buildReceiptLines(snapshot, stats) };
}

function fetchedAt(response: Response): string {
  const timestamp = Date.parse(response.headers.get("date") || "");
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function unavailableSnapshot(username: string, year: number, demo = false): ContributionSnapshot {
  return {
    username,
    displayName: demo ? "Demo receipt" : username,
    avatarUrl: null,
    year,
    source: demo ? "demo" : "fallback",
    sourceMessage: demo
      ? `The sample receipt is available for ${fallback.year}. Pick that year to try the demo.`
      : "GitHub is unavailable or this profile does not exist. Please try again.",
    available: false,
    fetchedAt: new Date().toISOString(),
    ...contributionPeriod(year),
    days: [],
    repositories: [],
    totalContributions: 0,
    totalCommits: null,
    pullRequests: null,
    reviews: null,
    issues: null,
    restrictedContributions: null,
  };
}

function demoSnapshot(year: number): ContributionSnapshot {
  if (year !== fallback.year) return unavailableSnapshot("demo", year, true);
  return { ...fallback, source: "demo", available: true } as ContributionSnapshot;
}

async function fetchGraphQLSnapshot(username: string, year: number, token: string): Promise<ContributionSnapshot> {
  const period = contributionPeriod(year);
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "Commit-Printer" },
    body: JSON.stringify({
      query: contributionsQuery,
      variables: { login: username, from: `${period.periodStart}T00:00:00Z`, to: `${period.periodEnd}T23:59:59Z` },
    }),
    next: { revalidate: CACHE_SECONDS },
    cache: "force-cache",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("GitHub GraphQL request failed");
  const result = await response.json() as { data?: { user?: GraphQLUser | null }; errors?: unknown[] };
  if (result.errors?.length || !result.data?.user) throw new Error("GitHub profile data unavailable");
  const user = result.data.user;
  const collection = user.contributionsCollection;
  const days = normalizeDays(collection.contributionCalendar.weeks.flatMap((week) => week.contributionDays)
    .map((day) => ({ date: day.date, count: day.contributionCount })))
    .filter((day) => day.date >= period.periodStart && day.date <= period.periodEnd);
  let privateIndex = 0;
  const repositories: RepositorySummary[] = collection.commitContributionsByRepository
    .sort((left, right) => right.contributions.totalCount - left.contributions.totalCount)
    .map(({ repository, contributions }) => ({
      name: repository.isPrivate ? `PRIVATE REPO #${++privateIndex}` : repository.nameWithOwner,
      commits: contributions.totalCount,
      isPrivate: repository.isPrivate,
      url: repository.isPrivate ? null : repository.url,
    }));

  return {
    username: user.login,
    displayName: user.name || user.login,
    avatarUrl: user.avatarUrl,
    year,
    source: "live",
    sourceMessage: "GitHub contribution data. Refreshed hourly.",
    available: true,
    fetchedAt: fetchedAt(response),
    ...period,
    days,
    repositories,
    totalContributions: days.reduce((sum, day) => sum + day.count, 0),
    totalCommits: collection.totalCommitContributions,
    pullRequests: collection.totalPullRequestContributions,
    reviews: collection.totalPullRequestReviewContributions,
    issues: collection.totalIssueContributions,
    restrictedContributions: collection.restrictedContributionsCount,
  };
}

async function fetchPublicSnapshot(username: string, year: number): Promise<ContributionSnapshot> {
  const period = contributionPeriod(year);
  const publicOptions = {
    headers: { "User-Agent": "Commit-Printer", "Accept-Language": "en-US,en;q=0.8" },
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
  if (calendarResult.status !== "fulfilled" || !calendarResult.value.ok) throw new Error("Public GitHub calendar unavailable");
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
  const token = process.env.GH_PAT?.trim();
  if (token) {
    try {
      const snapshot = rememberSnapshot(await fetchGraphQLSnapshot(username, selectedYear, token));
      void putStoredSnapshot(durableSnapshotKey(username, selectedYear), snapshot);
      return snapshot;
    } catch {
      // A token can expire or lack access; the public calendar remains available.
    }
  }
  try {
    const snapshot = rememberSnapshot(await fetchPublicSnapshot(username, selectedYear));
    void putStoredSnapshot(durableSnapshotKey(username, selectedYear), snapshot);
    return snapshot;
  } catch {
    const saved = lastKnownSnapshots.get(`${username.toLowerCase()}:${selectedYear}`);
    if (saved) return { ...saved, source: "fallback", sourceMessage: "GitHub is unavailable. Showing the last successful snapshot for this profile and year." };
    // Cross-instance recovery: local .db file locally, Turso Cloud in production.
    // Fail-closed: only exact profile/year snapshots are reused, never guessed zeros.
    const stored = await getStoredSnapshot(durableSnapshotKey(username, selectedYear));
    if (stored) return { ...stored, source: "fallback", sourceMessage: "GitHub is unavailable. Showing the last successful snapshot for this profile and year." };
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
