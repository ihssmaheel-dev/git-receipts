import fallback from "../data/fallback.json";
import { contributionPeriod, normalizeYear, parseGitHubUsername } from "./githubInput";
import { buildReceiptLines } from "./receiptLines";
import { calculateStats } from "./stats";
import type { ContributionSnapshot, ReceiptData } from "./types";

/**
 * Pure snapshot builders shared by the server fetcher and unit tests.
 * Nothing here touches the network or the database, so tests import this
 * module directly instead of the `server-only` fetcher.
 */
export function receiptFromSnapshot(snapshot: ContributionSnapshot): ReceiptData {
  const stats = calculateStats(snapshot);
  return { snapshot, stats, lines: buildReceiptLines(snapshot, stats) };
}

export function unavailableSnapshot(username: string, year: number, demo = false): ContributionSnapshot {
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
    rateLimited: false,
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

export function demoSnapshot(year: number): ContributionSnapshot {
  if (year !== fallback.year) return unavailableSnapshot("demo", year, true);
  return { ...fallback, source: "demo", available: true } as ContributionSnapshot;
}

/** Quota exhaustion is explicit and charming: the printer is out of paper. */
export function outOfPaperSnapshot(username: string, year: number): ContributionSnapshot {
  return {
    ...unavailableSnapshot(username, year),
    sourceMessage: "Out of paper — request quota is empty. Try again soon.",
    rateLimited: true,
  };
}

/** Rendered when our own abuse gate trips: no GitHub fetch is attempted. */
export function slowDownReceiptData(year?: number, input?: string, retryAfterMs = 60_000): ReceiptData {
  const selectedYear = normalizeYear(year);
  const username = (input?.trim() && parseGitHubUsername(input)) || "limited";
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return receiptFromSnapshot({
    ...unavailableSnapshot(username, selectedYear),
    sourceMessage: `Too many requests — try again in ${seconds}s.`,
  });
}
