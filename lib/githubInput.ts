import { isCalendarDate, normalizeDays } from "./stats";
import type { ContributionDay } from "./types";

/** Accept a handle or profile URL, while keeping all network destinations fixed. */
export function parseGitHubUsername(input: string): string | null {
  const value = input.trim();
  let candidate = value.replace(/^@/, "");
  if (/^(?:https?:\/\/|(?:www\.)?github\.com\/)/i.test(value)) {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!['https:', 'http:'].includes(url.protocol) ||
          !['github.com', 'www.github.com'].includes(url.hostname.toLowerCase()) ||
          url.username || url.password || url.port) return null;
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length !== 1) return null;
      candidate = decodeURIComponent(segments[0]);
    } catch {
      return null;
    }
  }
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(candidate)
    ? candidate
    : null;
}

function attribute(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? null;
}

function textContent(html: string): string {
  return html.replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|#160|#xA0);/gi, " ")
    .replace(/&#(?:44|x2c);/gi, ",")
    .replace(/\s+/g, " ").trim();
}

/** GitHub's public calendar has counts in tooltips, never in color levels. */
export function parseContributionCalendar(
  html: string,
  periodStart?: string,
  periodEnd?: string,
): ContributionDay[] {
  const countsById = new Map<string, number>();
  for (const match of html.matchAll(/<tool-tip\b([^>]*)>([\s\S]*?)<\/tool-tip>/gi)) {
    const id = attribute(match[1], "for");
    const countText = textContent(match[2]).match(/^(No|[\d,]+)\s+contributions?\b/i)?.[1];
    if (id && countText) {
      const count = /^no$/i.test(countText) ? 0 : Number(countText.replaceAll(",", ""));
      if (Number.isSafeInteger(count) && count >= 0) countsById.set(id, count);
    }
  }
  const days: ContributionDay[] = [];
  for (const match of html.matchAll(/<(?:td|rect)\b([^>]*\bdata-date\s*=\s*["'][^"']+["'][^>]*)>/gi)) {
    const tag = match[1];
    const date = attribute(tag, "data-date");
    if (!date || !isCalendarDate(date) || (periodStart && date < periodStart) || (periodEnd && date > periodEnd)) continue;
    const rawCount = attribute(tag, "data-count");
    const directCount = rawCount === null || !/^\d+$/.test(rawCount) ? undefined : Number(rawCount);
    const count = directCount ?? countsById.get(attribute(tag, "id") ?? "");
    if (count !== undefined && Number.isSafeInteger(count) && count >= 0) days.push({ date, count });
  }
  return normalizeDays(days);
}

export function normalizeYear(year?: number, now = new Date()): number {
  const currentYear = now.getUTCFullYear();
  return Number.isFinite(year)
    ? Math.min(currentYear, Math.max(2008, Math.trunc(year!)))
    : currentYear;
}

export function contributionPeriod(year: number, now = new Date()): { periodStart: string; periodEnd: string } {
  return {
    periodStart: `${year}-01-01`,
    periodEnd: year === now.getUTCFullYear() ? now.toISOString().slice(0, 10) : `${year}-12-31`,
  };
}

/** Thrown when GitHub's quota (or our shared outbound guard) is empty: renders OUT OF PAPER. */
export class RateLimitedError extends Error {
  constructor(message = "GitHub request quota is empty.") {
    super(message);
    this.name = "RateLimitedError";
  }
}

/** True for HTTP statuses that signal an empty API quota rather than a missing profile. */
export function isQuotaStatus(status: number, headers: Headers): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  const remaining = headers.get("x-ratelimit-remaining");
  return remaining !== null && Number(remaining) <= 0;
}

/** True when a GraphQL payload reports RATE_LIMITED instead of data. */
export function hasQuotaErrorBody(result: { errors?: unknown }): boolean {
  if (!Array.isArray(result.errors)) return false;
  return result.errors.some((error) =>
    typeof error === "object" && error !== null &&
    (error as { type?: unknown }).type === "RATE_LIMITED");
}
