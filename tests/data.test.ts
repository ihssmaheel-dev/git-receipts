import assert from "node:assert/strict";
import test from "node:test";
import demo from "../data/fallback.json";
import { createSnapshotCache } from "../lib/githubCache";
import { contributionPeriod, hasQuotaErrorBody, isQuotaStatus, normalizeYear, parseContributionCalendar, parseGitHubUsername, RateLimitedError } from "../lib/githubInput";
import { outOfPaperSnapshot, slowDownReceiptData } from "../lib/receiptData";
import { buildReceiptLines, receiptLineText, receiptNumber } from "../lib/receiptLines";
import { calculateStats, computeStreaks, normalizeDays } from "../lib/stats";
import type { ContributionSnapshot } from "../lib/types";

function snapshot(overrides: Partial<ContributionSnapshot> = {}): ContributionSnapshot {
  return {
    username: "octocat", displayName: "Octocat", avatarUrl: null, year: 2025,
    source: "live", sourceMessage: "Test snapshot", available: true, rateLimited: false,
    fetchedAt: "2025-01-05T12:00:00Z", periodStart: "2025-01-01", periodEnd: "2025-01-05",
    days: [{ date: "2025-01-01", count: 2 }, { date: "2025-01-02", count: 3 },
      { date: "2025-01-03", count: 0 }, { date: "2025-01-04", count: 5 }, { date: "2025-01-05", count: 0 }],
    repositories: [], totalContributions: 10, totalCommits: 6,
    pullRequests: 2, reviews: 1, issues: 1, restrictedContributions: 0,
    ...overrides,
  };
}

function calendar(start: string, counts: number[]): ContributionSnapshot["days"] {
  const first = Date.parse(`${start}T00:00:00Z`);
  return counts.map((count, index) => ({ date: new Date(first + index * 86_400_000).toISOString().slice(0, 10), count }));
}

test("GitHub inputs accept handles and profile links while refusing arbitrary destinations", () => {
  for (const [input, expected] of [
    [" octocat ", "octocat"], ["@octocat", "octocat"], ["https://github.com/Octo-Cat/", "Octo-Cat"],
    ["github.com/octocat?tab=repositories", "octocat"], ["https://www.github.com/octocat", "octocat"],
  ]) assert.equal(parseGitHubUsername(input), expected);
  for (const input of ["", "-octocat", "octocat-", "octo--cat", "a".repeat(40), "../etc/passwd",
    "https://example.com/octocat", "https://github.com/octocat/repository", "https://github.com.evil.test/octocat",
    "https://github.com@evil.test/octocat", "https://alice:secret@github.com/octocat", "https://github.com:8443/octocat",
    "https://github.com/%3Cscript%3E", "ftp://github.com/octocat"])
    assert.equal(parseGitHubUsername(input), null, input);
});

test("public contribution markup joins dates to exact tooltip counts, including commas and zero", () => {
  const html = `
    <td id="d2" data-level="4" data-date="2025-01-02"></td>
    <td data-date='2025-01-01' id='d1'></td>
    <td data-date="2025-01-03" id="d3"></td>
    <td data-date="2025-01-04" id="no-tooltip" data-level="4"></td>
    <rect data-count="7" data-date="2024-12-31" />
    <tool-tip for="d3">No contributions on January 3rd.</tool-tip>
    <tool-tip for='d1'><span>1 contribution on January 1st.</span></tool-tip>
    <tool-tip for="d2">1,034 contributions on January 2nd.</tool-tip>`;
  assert.deepEqual(parseContributionCalendar(html, "2025-01-01", "2025-12-31"), [
    { date: "2025-01-01", count: 1 }, { date: "2025-01-02", count: 1034 }, { date: "2025-01-03", count: 0 },
  ]);
  assert.deepEqual(parseContributionCalendar('<rect data-date="2024-02-29" data-count="9"/>'), [{ date: "2024-02-29", count: 9 }]);
  assert.deepEqual(parseContributionCalendar('<td data-date="2025-02-29" data-count="9"></td>'), []);
});

test("year requests stay within supported years and current periods stop today", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  assert.equal(normalizeYear(undefined, now), 2026);
  assert.equal(normalizeYear(3026, now), 2026);
  assert.equal(normalizeYear(1900, now), 2008);
  assert.equal(normalizeYear(Number.NaN, now), 2026);
  assert.deepEqual(contributionPeriod(2026, now), { periodStart: "2026-01-01", periodEnd: "2026-10-08" });
  assert.deepEqual(contributionPeriod(2024, now), { periodStart: "2024-01-01", periodEnd: "2024-12-31" });
});

test("streaks break at missing days and preserve yesterday's current streak", () => {
  assert.deepEqual(computeStreaks([
    { date: "2025-01-01", count: 2 }, { date: "2025-01-02", count: 1 },
    { date: "2025-01-04", count: 3 }, { date: "2025-01-05", count: 4 }, { date: "2025-01-06", count: 5 },
  ], "2025-01-07"), { currentStreak: 3, longestStreak: 3 });
  assert.deepEqual(computeStreaks([{ date: "2025-01-05", count: 4 }], "2025-01-08"), { currentStreak: 0, longestStreak: 1 });
  assert.deepEqual(computeStreaks([], "2025-01-01"), { currentStreak: 0, longestStreak: 0 });
});

test("calendar normalization does not inflate duplicated days or accept invalid counts", () => {
  assert.deepEqual(normalizeDays([
    { date: "2025-01-02", count: 2 }, { date: "2025-01-01", count: 1 }, { date: "2025-01-02", count: 2 },
    { date: "2025-02-29", count: 9 }, { date: "2025-01-04", count: -1 }, { date: "2025-01-03", count: Number.NaN },
    { date: "2025-01-06", count: 1.5 },
  ]), [{ date: "2025-01-01", count: 1 }, { date: "2025-01-02", count: 2 }]);
});

test("best month uses exact calendar-month totals, including partial months and earliest tied month", () => {
  const days = calendar("2024-01-30", [3, 4, 2, 5]);
  const data = snapshot({ year: 2024, periodStart: "2024-01-30", periodEnd: "2024-02-02", days, totalContributions: 14 });
  const stats = calculateStats(data, data.periodEnd);
  assert.equal(stats.calendarComplete, true);
  assert.deepEqual(stats.bestMonth, { month: "2024-01", count: 7 });
  assert.equal(stats.longestBreak, 0);
  const februaryWins = calculateStats({ ...data, days: calendar("2024-01-30", [3, 4, 2, 6]) }, data.periodEnd);
  assert.deepEqual(februaryWins.bestMonth, { month: "2024-02", count: 8 });
  assert.ok(buildReceiptLines(data, stats).some((line) => line.type === "pair"
    && line.label === "BEST MONTH / 2024-01" && line.value === "7"));
});

test("longest break counts leading and trailing zero runs strictly within the receipt period", () => {
  const data = snapshot({ periodStart: "2024-02-27", periodEnd: "2024-03-03", year: 2024,
    days: [
      { date: "2024-02-26", count: 0 }, ...calendar("2024-02-27", [0, 0, 1, 0, 0, 0]),
      { date: "2024-03-04", count: 0 },
    ], totalContributions: 1 });
  const stats = calculateStats(data, data.periodEnd);
  assert.equal(stats.longestBreak, 3);
  assert.deepEqual(stats.bestMonth, { month: "2024-02", count: 1 });
  const allZero = calculateStats({ ...data, days: calendar("2024-02-27", [0, 0, 0, 0, 0, 0]), totalContributions: 0 }, data.periodEnd);
  assert.equal(allZero.longestBreak, 6);
  assert.deepEqual(allZero.bestMonth, { month: "2024-02", count: 0 });
});

test("missing or invalid days omit exact period statistics, achievements, and receipt identifiers", () => {
  const data = snapshot();
  for (const incomplete of [
    data.days.slice(1), data.days.slice(0, -1), data.days.filter((day) => day.date !== "2025-01-03"),
    data.days.map((day) => day.date === "2025-01-03" ? { ...day, count: Number.NaN } : day),
  ]) {
    const partial = { ...data, days: incomplete, totalContributions: 1000 };
    const stats = calculateStats(partial, partial.periodEnd);
    assert.equal(stats.calendarComplete, false);
    assert.equal(stats.bestMonth, null);
    assert.equal(stats.longestBreak, null);
    assert.equal(receiptNumber(partial, stats), null);
    const lines = buildReceiptLines(partial, stats);
    assert.ok(!lines.some((line) => line.type === "pair" && /BEST MONTH|LONGEST BREAK/.test(line.label)));
    assert.ok(!lines.some((line) => line.type === "text" && line.text.includes("★")));
    assert.ok(!lines.some((line) => line.type === "footer" && line.text.startsWith("No. ")));
    assert.ok(!lines.some((line) => line.type === "pair" && line.label === "BILL NO."));
  }
  const unavailable = { ...data, available: false };
  assert.equal(calculateStats(unavailable).bestMonth, null);
  assert.equal(calculateStats(unavailable).longestBreak, null);
});

test("one achievement seal selects the highest reached threshold and bill numbers precede the account", () => {
  const make = (counts: number[]) => {
    const days = calendar("2025-01-01", counts);
    const data = snapshot({ days, periodEnd: days.at(-1)!.date, totalContributions: counts.reduce((sum, count) => sum + count, 0) });
    const stats = calculateStats(data, data.periodEnd);
    return { data, stats, lines: buildReceiptLines(data, stats) };
  };
  const awarded = make(Array.from({ length: 200 }, () => 5));
  const stamps = awarded.lines.filter((line) => line.type === "text" && line.text.includes("★"));
  assert.deepEqual(stamps, [
    { type: "text", text: "100+ DAY STREAK ★ CENTURY STREAK", align: "center" },
  ]);
  assert.equal(receiptNumber(awarded.data, awarded.stats), "2025-1000-200");
  assert.deepEqual(awarded.lines.slice(0, 3), [
    { type: "heading", text: "COMMIT PRINTER", detail: "GITHUB ACTIVITY RECEIPT" },
    { type: "pair", label: "BILL NO.", value: "2025-1000-200" },
    { type: "pair", label: "ACCOUNT", value: "@octocat" },
  ]);
  assert.ok(awarded.lines.some((line) => line.type === "footer" && line.text === "No. 2025-1000-200"));
  for (const [counts, text] of [
    [Array.from({ length: 30 }, () => 1), "30+ DAY STREAK ★ STREAK KEEPER"],
    [Array.from({ length: 29 }, () => 1), "7+ DAY STREAK ★ WEEK IN MOTION"],
    [Array.from({ length: 266 }, (_, index) => index % 4 === 3 ? 0 : 5), "ACTIVE 200+ DAYS ★ 200-DAY CLUB"],
    [Array.from({ length: 265 }, (_, index) => index % 4 === 3 ? 0 : 5), "ACTIVE 100+ DAYS ★ HUNDRED-DAY CLUB"],
    [[1000], "1000+ ★ FOUR-FIGURE YEAR"],
  ] as [number[], string][]) {
    const lines = make(counts).lines;
    assert.deepEqual(lines.filter((line) => line.type === "text" && line.text.includes("★")), [
      { type: "text", text, align: "center" },
    ]);
  }
  for (const counts of [Array.from({ length: 6 }, () => 1),
    Array.from({ length: 132 }, (_, index) => index % 4 === 3 ? 0 : 5), [999]]) {
    assert.ok(!make(counts).lines.some((line) => line.type === "text" && line.text.includes("★")));
  }
  const unavailableLines = buildReceiptLines({ ...awarded.data, available: false }, awarded.stats);
  assert.ok(!unavailableLines.some((line) => line.type === "text" && line.text.includes("★")));
  assert.ok(!unavailableLines.some((line) => line.type === "pair" && line.label === "BILL NO."));
  assert.ok(!unavailableLines.some((line) => line.type === "footer" && line.text.startsWith("No. ")));
});

test("stats choose the first busiest day on ties and protect private repository names", () => {
  const data = snapshot({ repositories: [
    { name: "employer/top-secret", commits: 9, isPrivate: true, url: "https://github.com/employer/top-secret" },
    { name: "octocat/public", commits: 2, isPrivate: false, url: "https://github.com/octocat/public" },
  ] });
  const stats = calculateStats(data, "2025-01-05");
  assert.equal(stats.activeDays, 3);
  assert.equal(stats.longestStreak, 2);
  assert.equal(stats.currentStreak, 1);
  assert.deepEqual(stats.busiestDay, { date: "2025-01-04", count: 5 });
  assert.deepEqual(stats.topRepos[0], { name: "PRIVATE REPO #1", commits: 9, isPrivate: true, url: null });
  const tied = calculateStats(snapshot({ days: [{ date: "2025-01-02", count: 3 }, { date: "2025-01-01", count: 3 }] }), "2025-01-05");
  assert.equal(tied.busiestDay?.date, "2025-01-01");
  const lines = buildReceiptLines(data, stats).map(receiptLineText).join("\n");
  assert.ok(!lines.includes("top-secret"));
});

test("a public-only receipt omits unknown activity breakdown instead of reporting zero", () => {
  const data = snapshot({ source: "public", totalCommits: null, pullRequests: null, reviews: null, issues: null });
  const stats = calculateStats(data, "2025-01-05");
  const lines = buildReceiptLines(data, stats);
  assert.equal(stats.otherContributions, null);
  assert.equal(lines.filter((line) => line.type === "item").length, 0);
  assert.deepEqual(lines.find((line) => line.type === "total"), { type: "total", label: "TOTAL CONTRIBUTIONS", value: 10 });
  assert.ok(lines.some((line) => line.type === "footer" && line.text.includes("BREAKDOWN UNAVAILABLE")));
});

test("unavailable snapshots do not produce numerical receipts", () => {
  const data = snapshot({ available: false, source: "fallback" });
  const lines = buildReceiptLines(data, calculateStats(data));
  assert.ok(lines.some((line) => line.type === "text" && line.text === "DATA UNAVAILABLE"));
  assert.equal(lines.filter((line) => line.type === "item" || line.type === "total").length, 0);
});

test("quota exhaustion renders OUT OF PAPER without fabricating totals", () => {
  const empty = outOfPaperSnapshot("octocat", 2025);
  assert.equal(empty.available, false);
  assert.equal(empty.rateLimited, true);
  const lines = buildReceiptLines(empty, calculateStats(empty));
  assert.ok(lines.some((line) => line.type === "text" && line.text === "OUT OF PAPER"));
  assert.ok(!lines.some((line) => line.type === "text" && line.text === "DATA UNAVAILABLE"));
  assert.equal(lines.filter((line) => line.type === "item" || line.type === "total").length, 0);
  assert.ok(!lines.some((line) => line.type === "footer" && line.text.startsWith("No. ")));
});

test("quota classifiers separate empty limits from missing profiles", () => {
  assert.equal(new RateLimitedError() instanceof Error, true);
  assert.equal(new RateLimitedError().name, "RateLimitedError");
  assert.equal(isQuotaStatus(429, new Headers()), true);
  assert.equal(isQuotaStatus(403, new Headers({ "x-ratelimit-remaining": "0" })), true);
  assert.equal(isQuotaStatus(403, new Headers()), false);
  assert.equal(isQuotaStatus(403, new Headers({ "x-ratelimit-remaining": "12" })), false);
  assert.equal(isQuotaStatus(404, new Headers()), false);
  assert.equal(isQuotaStatus(500, new Headers()), false);
  assert.equal(hasQuotaErrorBody({ errors: [{ type: "RATE_LIMITED" }] }), true);
  assert.equal(hasQuotaErrorBody({ errors: [{ message: "Something went wrong" }] }), false);
  assert.equal(hasQuotaErrorBody({}), false);
});

test("our own abuse gate slows down without touching GitHub", () => {
  const slowed = slowDownReceiptData(2025, "octocat", 90_000);
  assert.equal(slowed.snapshot.available, false);
  assert.equal(slowed.snapshot.rateLimited, false);
  assert.equal(slowed.snapshot.username, "octocat");
  assert.ok(slowed.snapshot.sourceMessage.includes("90s"));
  const anonymous = slowDownReceiptData(2025, "not a user!!", 1000);
  assert.equal(anonymous.snapshot.username, "limited");
  assert.ok(anonymous.snapshot.sourceMessage.includes("1s"));
});

test("bundled demo totals match its calendar and receipt items", () => {
  const data = demo as ContributionSnapshot;
  const stats = calculateStats(data, data.periodEnd);
  assert.equal(data.source, "demo");
  assert.equal(data.year, Number(data.periodStart.slice(0, 4)));
  assert.equal(data.year, Number(data.periodEnd.slice(0, 4)));
  assert.equal(data.totalContributions, data.days.reduce((sum, day) => sum + day.count, 0));
  const lines = buildReceiptLines(data, stats);
  assert.equal(lines.filter((line) => line.type === "item").reduce((sum, line) => sum + (line.type === "item" ? line.total : 0), 0), stats.totalContributions);
  assert.ok(lines.some((line) => line.type === "footer" && line.text.includes("DEMO DATA")));
});

test("concurrent snapshot lookups share work and cached responses retain their original freshness", async () => {
  let timestamp = Date.parse("2025-01-05T12:00:00Z");
  const cache = createSnapshotCache({ now: () => timestamp, successTtlMs: 1000 });
  let lookups = 0;
  const load = async () => {
    lookups += 1;
    return snapshot({ fetchedAt: new Date(timestamp - 500).toISOString() });
  };
  const results = await Promise.all([cache("octocat:2025", load), cache("octocat:2025", load), cache("octocat:2025", load)]);
  assert.equal(lookups, 1);
  assert.strictEqual(results[0], results[1]);
  timestamp += 499;
  await cache("octocat:2025", load);
  assert.equal(lookups, 1);
  timestamp += 1;
  await cache("octocat:2025", load);
  assert.equal(lookups, 2);
});

test("failed snapshots cool down briefly, then retry without crossing username or year keys", async () => {
  let timestamp = Date.parse("2025-01-05T12:00:00Z");
  const cache = createSnapshotCache({ now: () => timestamp, retryTtlMs: 100 });
  let lookups = 0;
  const load = async () => {
    lookups += 1;
    return snapshot({ available: false, source: "fallback" });
  };
  await cache("octocat:2025", load);
  await cache("octocat:2025", load);
  assert.equal(lookups, 1);
  await cache("other:2025", load);
  await cache("octocat:2024", load);
  assert.equal(lookups, 3);
  timestamp += 100;
  await cache("octocat:2025", load);
  assert.equal(lookups, 4);
});
