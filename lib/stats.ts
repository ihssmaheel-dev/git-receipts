import type {
  ContributionDay,
  ContributionSnapshot,
  ContributionStats,
  RepositorySummary,
} from "./types";

const DAY_MS = 86_400_000;

export function isCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function previousDate(date: string): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Sort and deduplicate a calendar without treating missing dates as active. */
export function normalizeDays(days: readonly ContributionDay[]): ContributionDay[] {
  const byDate = new Map<string, number>();
  for (const day of days) {
    if (!isCalendarDate(day.date) || !Number.isInteger(day.count) || day.count < 0) continue;
    byDate.set(day.date, Math.max(byDate.get(day.date) ?? 0, day.count));
  }
  return [...byDate].sort(([left], [right]) => left.localeCompare(right))
    .map(([date, count]) => ({ date, count }));
}

export function computeStreaks(
  input: readonly ContributionDay[],
  referenceDate = new Date().toISOString().slice(0, 10),
): { currentStreak: number; longestStreak: number } {
  const days = normalizeDays(input).filter((day) => day.date <= referenceDate);
  let longestStreak = 0;
  let running = 0;
  let lastActiveDate: string | null = null;

  for (const day of days) {
    if (day.count === 0) {
      running = 0;
      lastActiveDate = null;
      continue;
    }
    running = lastActiveDate === previousDate(day.date) ? running + 1 : 1;
    lastActiveDate = day.date;
    longestStreak = Math.max(longestStreak, running);
  }

  const byDate = new Map(days.map((day) => [day.date, day.count]));
  // Today can still be in progress; yesterday's activity keeps a streak alive.
  let cursor = (byDate.get(referenceDate) ?? 0) > 0 ? referenceDate : previousDate(referenceDate);
  let currentStreak = 0;
  while ((byDate.get(cursor) ?? 0) > 0) {
    currentStreak += 1;
    cursor = previousDate(cursor);
  }
  return { currentStreak, longestStreak };
}

function anonymizeRepos(repositories: readonly RepositorySummary[]): RepositorySummary[] {
  let privateIndex = 0;
  return [...repositories]
    .sort((left, right) => (right.commits ?? 0) - (left.commits ?? 0))
    .map((repository) => repository.isPrivate
      ? { ...repository, name: `PRIVATE REPO #${++privateIndex}`, url: null }
      : { ...repository });
}

/** A missing date is unknown, never an assumed zero-contribution day. */
function derivePeriodStats(
  days: readonly ContributionDay[],
  snapshot: ContributionSnapshot,
): Pick<ContributionStats, "calendarComplete" | "bestMonth" | "longestBreak"> {
  const { periodStart, periodEnd } = snapshot;
  const expectedDays = isCalendarDate(periodStart) && isCalendarDate(periodEnd)
    ? (Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${periodStart}T00:00:00Z`)) / DAY_MS + 1
    : 0;
  const calendarComplete = snapshot.available && expectedDays > 0 && days.length === expectedDays
    && days[0]?.date === periodStart && days.at(-1)?.date === periodEnd
    && days.every((day, index) => index === 0 || days[index - 1].date === previousDate(day.date));
  if (!calendarComplete) return { calendarComplete: false, bestMonth: null, longestBreak: null };

  const monthCounts = new Map<string, number>();
  let longestBreak = 0;
  let runningBreak = 0;
  for (const day of days) {
    const month = day.date.slice(0, 7);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + day.count);
    runningBreak = day.count === 0 ? runningBreak + 1 : 0;
    longestBreak = Math.max(longestBreak, runningBreak);
  }
  let bestMonth: ContributionStats["bestMonth"] = null;
  // Calendar months are considered only within the receipt period; the earliest wins ties.
  for (const [month, count] of monthCounts) {
    if (!bestMonth || count > bestMonth.count) bestMonth = { month, count };
  }
  return { calendarComplete, bestMonth, longestBreak };
}

export function calculateStats(
  snapshot: ContributionSnapshot,
  referenceDate = new Date().toISOString().slice(0, 10),
): ContributionStats {
  const days = normalizeDays(snapshot.days)
    .filter((day) => day.date >= snapshot.periodStart && day.date <= snapshot.periodEnd);
  const { currentStreak, longestStreak } = computeStreaks(days, referenceDate);
  const periodStats = derivePeriodStats(days, snapshot);
  const known = [snapshot.totalCommits, snapshot.pullRequests, snapshot.reviews, snapshot.issues];
  const knownTotal = known.reduce<number>((sum, count) => sum + (count ?? 0), 0);
  let busiestDay: ContributionDay | null = null;
  for (const day of days) {
    if (day.count > 0 && (!busiestDay || day.count > busiestDay.count)) busiestDay = day;
  }

  return {
    totalContributions: snapshot.totalContributions,
    totalCommits: snapshot.totalCommits,
    pullRequests: snapshot.pullRequests,
    reviews: snapshot.reviews,
    issues: snapshot.issues,
    otherContributions: known.every((count) => count !== null)
      ? Math.max(0, snapshot.totalContributions - knownTotal)
      : null,
    activeDays: days.filter((day) => day.count > 0).length,
    currentStreak,
    longestStreak,
    busiestDay,
    ...periodStats,
    topRepos: anonymizeRepos(snapshot.repositories).slice(0, 5),
  };
}
