import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { contributionPeriod, hasQuotaErrorBody, isQuotaStatus, RateLimitedError } from "./githubInput";
import { normalizeDays } from "./stats";
import type { ContributionSnapshot, RepositorySummary } from "./types";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const CACHE_SECONDS = 3600;

const contributionsQuery = `
  query GitReceipts($login: String!, $from: DateTime!, $to: DateTime!) {
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

type Period = Pick<ContributionSnapshot, "periodStart" | "periodEnd">;

async function fetchGraphQLSnapshot(
  username: string,
  year: number,
  token: string,
  period: Period,
  request: typeof fetch,
): Promise<ContributionSnapshot> {
  const response = await request(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "Git-Receipts" },
    body: JSON.stringify({
      query: contributionsQuery,
      variables: { login: username, from: `${period.periodStart}T00:00:00Z`, to: `${period.periodEnd}T23:59:59Z` },
    }),
    // GraphQL can return HTTP 200 with RATE_LIMITED instead of data. Never persist
    // a raw response: only a successfully parsed snapshot enters the cache below.
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    if (isQuotaStatus(response.status, response.headers)) throw new RateLimitedError();
    throw new Error("GitHub GraphQL request failed");
  }
  const result = await response.json() as { data?: { user?: GraphQLUser | null }; errors?: unknown[] };
  if (hasQuotaErrorBody(result)) throw new RateLimitedError();
  if (result.errors?.length || !result.data?.user) throw new Error("GitHub profile data unavailable");
  const user = result.data.user;
  const collection = user.contributionsCollection;
  const days = normalizeDays(collection.contributionCalendar.weeks.flatMap((week) => week.contributionDays)
    .map((day) => ({ date: day.date, count: day.contributionCount })))
    .filter((day) => day.date >= period.periodStart && day.date <= period.periodEnd);
  const expectedDays = Math.round((Date.parse(period.periodEnd) - Date.parse(period.periodStart)) / 86_400_000) + 1;
  if (days.length !== expectedDays || [collection.totalCommitContributions,
    collection.totalPullRequestContributions, collection.totalPullRequestReviewContributions,
    collection.totalIssueContributions, collection.restrictedContributionsCount]
    .some((count) => !Number.isSafeInteger(count) || count < 0)) {
    throw new Error("GitHub contribution data is incomplete");
  }
  let privateIndex = 0;
  const repositories: RepositorySummary[] = collection.commitContributionsByRepository
    .sort((left, right) => right.contributions.totalCount - left.contributions.totalCount)
    .map(({ repository, contributions }) => ({
      name: repository.isPrivate ? `PRIVATE REPO #${++privateIndex}` : repository.nameWithOwner,
      commits: contributions.totalCount,
      isPrivate: repository.isPrivate,
      url: repository.isPrivate ? null : repository.url,
    }));
  const responseTime = Date.parse(response.headers.get("date") || "");
  return {
    username: user.login,
    displayName: user.name || user.login,
    avatarUrl: user.avatarUrl,
    year,
    source: "live",
    sourceMessage: "GitHub contribution data. Refreshed hourly.",
    available: true,
    rateLimited: false,
    fetchedAt: Number.isFinite(responseTime) ? new Date(responseTime).toISOString() : new Date().toISOString(),
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

/** Shared Next cache contains validated success only; failed lookups remain retryable. */
export function createGraphQLSnapshotLoader({
  checkQuota,
  request = (input, init) => fetch(input, init),
  now = Date.now,
}: {
  checkQuota: () => Promise<boolean>;
  request?: typeof fetch;
  now?: () => number;
}) {
  return async function getGraphQLSnapshot(username: string, year: number, token: string): Promise<ContributionSnapshot> {
    const timestamp = now();
    const period = contributionPeriod(year, new Date(timestamp));
    // Token rotation must invalidate the cache, without serializing a secret into
    // cache arguments or revalidation logs. Private repository names are stripped
    // before a snapshot is returned or persisted.
    const tokenKey = createHash("sha256").update(token).digest("hex");
    const cached = unstable_cache(
      async (login: string, selectedYear: number, periodStart: string, periodEnd: string, _hour: number) => {
        if (!(await checkQuota())) throw new RateLimitedError("Shared GitHub quota guard tripped.");
        return fetchGraphQLSnapshot(login, selectedYear, token, { periodStart, periodEnd }, request);
      },
      ["github-validated-graphql-v1", tokenKey],
      { revalidate: CACHE_SECONDS },
    );
    // A new hour has a new key: an expired success cannot silently mask an empty
    // quota via stale-while-revalidate. Local snapshot dedupe and retry TTL remain
    // in githubCache; a failure here still lets github.ts try the public source.
    return cached(username.toLowerCase(), year, period.periodStart, period.periodEnd,
      Math.floor(timestamp / (CACHE_SECONDS * 1000)));
  };
}
