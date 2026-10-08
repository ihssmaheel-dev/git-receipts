export type ReceiptLine =
  | { type: "heading"; text: string; detail?: string }
  | { type: "text"; text: string; align?: "left" | "center" }
  | { type: "divider" }
  | { type: "item"; qty: number; name: string; total: number }
  | { type: "total"; label: string; value: number }
  | { type: "pair"; label: string; value: string }
  | { type: "spacer" }
  | { type: "footer"; text: string };

export interface ContributionDay {
  date: string;
  count: number;
}

export interface RepositorySummary {
  name: string;
  commits: number | null;
  isPrivate: boolean;
  url: string | null;
}

export type SnapshotSource = "live" | "public" | "fallback" | "demo";

export interface ContributionSnapshot {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  year: number;
  source: SnapshotSource;
  sourceMessage: string;
  available: boolean;
  fetchedAt: string;
  periodStart: string;
  periodEnd: string;
  days: ContributionDay[];
  repositories: RepositorySummary[];
  totalContributions: number;
  totalCommits: number | null;
  pullRequests: number | null;
  reviews: number | null;
  issues: number | null;
  restrictedContributions: number | null;
}

export interface ContributionStats {
  totalContributions: number;
  totalCommits: number | null;
  pullRequests: number | null;
  reviews: number | null;
  issues: number | null;
  otherContributions: number | null;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  busiestDay: ContributionDay | null;
  /** Every date in the selected period has a known contribution count. */
  calendarComplete: boolean;
  bestMonth: { month: string; count: number } | null;
  longestBreak: number | null;
  topRepos: RepositorySummary[];
}

export interface ReceiptData {
  snapshot: ContributionSnapshot;
  stats: ContributionStats;
  lines: ReceiptLine[];
}
