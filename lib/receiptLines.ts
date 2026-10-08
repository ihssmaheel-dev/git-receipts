import type { ContributionSnapshot, ContributionStats, ReceiptLine } from "./types";
import { chooseReceiptAchievement } from "./receiptSeal";

export function formatReceiptNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/** A stable receipt identifier made only from exact, available activity data. */
export function receiptNumber(snapshot: ContributionSnapshot, stats: ContributionStats): string | null {
  return snapshot.available && stats.calendarComplete
    ? `${snapshot.year}-${stats.totalContributions}-${stats.activeDays}`
    : null;
}

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "2-digit", timeZone: "UTC",
  }).toUpperCase();
}

/** The sole copy and number source for HTML, README SVG, and social images. */
export function buildReceiptLines(
  snapshot: ContributionSnapshot,
  stats: ContributionStats,
): ReceiptLine[] {
  const number = receiptNumber(snapshot, stats);
  const lines: ReceiptLine[] = [
    { type: "heading", text: "GIT RECEIPTS", detail: "GITHUB ACTIVITY RECEIPT" },
  ];
  if (number) lines.push({ type: "pair", label: "BILL NO.", value: number });
  lines.push(
    { type: "pair", label: "ACCOUNT", value: `@${snapshot.username}` },
    { type: "pair", label: "YEAR", value: String(snapshot.year) },
    { type: "pair", label: "PERIOD", value: `${shortDate(snapshot.periodStart)} – ${shortDate(snapshot.periodEnd)}` },
    { type: "divider" },
  );

  if (!snapshot.available) {
    if (snapshot.rateLimited) {
      lines.push(
        { type: "text", text: "OUT OF PAPER", align: "center" },
        { type: "text", text: "The paper tray is empty.", align: "center" },
        { type: "text", text: "Try again soon for a fresh slip.", align: "center" },
        { type: "divider" },
        { type: "footer", text: "END OF RECEIPT · OUT OF PAPER" },
      );
      return lines;
    }    lines.push(
      { type: "text", text: "DATA UNAVAILABLE", align: "center" },
      { type: "text", text: "GitHub could not provide this year.", align: "center" },
      { type: "text", text: "Try loading the profile again.", align: "center" },
      { type: "divider" },
      { type: "footer", text: "END OF RECEIPT · NO ACTIVITY TOTALS AVAILABLE" },
    );
    return lines;
  }

  const itemCounts: [string, number | null][] = [
    ["COMMITS", stats.totalCommits],
    ["PULL REQUESTS", stats.pullRequests],
    ["CODE REVIEWS", stats.reviews],
    ["ISSUES OPENED", stats.issues],
  ];
  for (const [name, count] of itemCounts) {
    if (count !== null) lines.push({ type: "item", qty: count, name, total: count });
  }
  if (stats.otherContributions !== null && stats.otherContributions > 0) {
    lines.push({ type: "item", qty: stats.otherContributions, name: "OTHER ACTIVITY", total: stats.otherContributions });
  }
  const breakdownUnavailable = itemCounts.every(([, count]) => count === null);
  if (breakdownUnavailable) {
    lines.push({ type: "text", text: "ACTIVITY SUMMARY", align: "center" });
  }
  const dayCount = (count: number) => `${formatReceiptNumber(count)} ${count === 1 ? "DAY" : "DAYS"}`;
  lines.push(
    { type: "pair", label: "ACTIVE DAYS", value: dayCount(stats.activeDays) },
    { type: "pair", label: "LONGEST STREAK", value: dayCount(stats.longestStreak) },
  );
  if (snapshot.year === new Date().getUTCFullYear()) {
    lines.push({ type: "pair", label: "CURRENT STREAK", value: dayCount(stats.currentStreak) });
  }
  if (stats.busiestDay) {
    lines.push({ type: "pair", label: `BUSIEST / ${shortDate(stats.busiestDay.date)}`, value: `${formatReceiptNumber(stats.busiestDay.count)} ${stats.busiestDay.count === 1 ? "CONTRIBUTION" : "CONTRIBUTIONS"}` });
  }
  if (stats.bestMonth) {
    lines.push({ type: "pair", label: `BEST MONTH / ${stats.bestMonth.month}`, value: formatReceiptNumber(stats.bestMonth.count) });
  }
  if (stats.longestBreak !== null) {
    lines.push({ type: "pair", label: "LONGEST BREAK", value: dayCount(stats.longestBreak) });
  }
  lines.push(
    { type: "divider" },
    { type: "total", label: "TOTAL CONTRIBUTIONS", value: stats.totalContributions },
  );
  const achievement = chooseReceiptAchievement(snapshot, stats);
  if (achievement) lines.push({ type: "text", text: achievement.text, align: "center" });
  const knownRepositories = stats.topRepos.filter((repository) => repository.commits !== null);
  if (knownRepositories.length > 0) {
    lines.push({ type: "divider" }, { type: "text", text: "TOP REPOSITORIES / COMMITS", align: "center" });
    for (const repository of knownRepositories) {
      lines.push({ type: "pair", label: repository.name, value: formatReceiptNumber(repository.commits!) });
    }
  }
  lines.push({ type: "divider" });
  lines.push(
    { type: "text", text: "THANK YOU FOR SHOWING UP", align: "center" },
    { type: "footer", text: "END OF RECEIPT" },
    { type: "footer", text: snapshot.source === "demo" ? "DEMO DATA · NOT A REAL GITHUB PROFILE" : snapshot.source === "fallback" ? "SAVED SNAPSHOT · GITHUB UNAVAILABLE" : snapshot.source === "public" ? "PUBLIC DATA · ACTIVITY BREAKDOWN UNAVAILABLE" : "GITHUB DATA · UPDATED HOURLY" },
  );
  if (snapshot.source === "fallback" && breakdownUnavailable) {
    lines.push({ type: "footer", text: "ACTIVITY BREAKDOWN UNAVAILABLE" });
  }
  if (number) lines.push({ type: "footer", text: `No. ${number}` });
  return lines;
}

export function receiptLineText(line: ReceiptLine): string {
  switch (line.type) {
    case "heading": return [line.text, line.detail].filter(Boolean).join(" — ");
    case "text":
    case "footer": return line.text;
    case "item": return `${line.name}: ${formatReceiptNumber(line.total)}`;
    case "total": return `${line.label}: ${formatReceiptNumber(line.value)}`;
    case "pair": return `${line.label}: ${line.value}`;
    case "divider": return "────────────────────────";
    case "spacer": return "";
  }
}
