import type { ContributionSnapshot, ContributionStats, ReceiptLine } from "./types";

export type SealGlyph = { text: string; x: number; y: number; size: number; rotation: number };
export type ReceiptSeal = {
  text: string;
  diameter: number;
  top: number;
  centerX: number;
  rotation: number;
  placement: "before" | "after";
  ink: string;
  opacity: number;
  rings: { radius: number; width: number; dash?: string; opacity?: number }[];
  glyphs: SealGlyph[];
  logo: { x: number; y: number; scale: number; path: string };
};

export type ReceiptSealProtectedArea = { x: number; y: number; width: number; height: number };
export type ReceiptSealOverlay = { x: number; y: number; scale: number };

/** Fit an impression over existing ink without changing paper length or obscuring machine-readable codes. */
export function getReceiptSealOverlay(seal: ReceiptSeal, bounds: {
  width: number;
  /** Contribution total bottom; the center may cross it by at most 24px in short footers. */
  top: number;
  /** Existing paper's safe bottom edge, including usable bottom padding. */
  bottom: number;
  /** The complete QR quiet-zone rectangle, used as the placement anchor. */
  qrArea?: ReceiptSealProtectedArea;
  protectedAreas?: readonly ReceiptSealProtectedArea[];
}): ReceiptSealOverlay | null {
  const { width, top, bottom } = bounds;
  if (![width, top, bottom, seal.diameter, seal.centerX].every(Number.isFinite)
    || width <= 0 || top < 0 || bottom <= top || seal.diameter <= 0) return null;
  const qr = bounds.qrArea;
  const protectedAreas = [...(bounds.protectedAreas ?? []), ...(qr ? [qr] : [])];
  if (protectedAreas.some((area) => ![area.x, area.y, area.width, area.height].every(Number.isFinite)
    || area.width <= 0 || area.height <= 0)) return null;
  const inset = 14;
  const clearance = 2;
  const preferredCenter = width / 2 + (seal.centerX - 180) * Math.min(1, width / 360);
  const fits = (x: number, y: number, diameter: number) => x >= inset && x + diameter <= width - inset
    && y >= 0 && y + diameter <= bottom
    && y + diameter / 2 >= top - 24
    && !protectedAreas.some((area) => x < area.x + area.width + clearance && x + diameter > area.x - clearance
      && y < area.y + area.height + clearance && y + diameter > area.y - clearance);
  const jitter = Math.abs(Math.round(seal.centerX)) % 7;
  const sides = seal.centerX < 180 ? ["left", "right"] as const : ["right", "left"] as const;
  const modes = seal.placement === "after" ? ["after", "before"] as const : ["before", "after"] as const;
  for (const mode of modes) for (const diameter of [96, 88, 80]) {
    if (diameter > seal.diameter || diameter > width - inset * 2) continue;
    const centeredX = Math.max(inset, Math.min(width - inset - diameter, preferredCenter - diameter / 2));
    if (!qr) {
      for (let y = top + 4; y >= Math.max(0, top - 24); y -= 2) {
        if (fits(centeredX, y, diameter)) return { x: centeredX, y, scale: diameter / seal.diameter };
      }
      continue;
    }
    // "Before" crosses existing footer ink immediately above the QR, without adding a row.
    if (mode === "before") {
      const y = qr.y - diameter - clearance - jitter;
      if (fits(centeredX, y, diameter)) return { x: centeredX, y, scale: diameter / seal.diameter };
    }
    // A printed barcode usually prevents a whole seal beneath the QR. Flank the lower
    // QR instead, moving slightly upward only as far as needed to keep both codes clear.
    for (const side of sides) {
      const x = side === "left" ? qr.x - diameter - clearance - jitter : qr.x + qr.width + clearance + jitter;
      const preferredY = mode === "after" ? qr.y + qr.height - diameter / 2 + jitter : qr.y - diameter * .65 + jitter;
      const lowestY = mode === "after" ? qr.y + qr.height - diameter * .8 : qr.y - diameter;
      for (let y = preferredY; y >= lowestY; y -= 2) {
        if (fits(x, y, diameter)) return { x, y, scale: diameter / seal.diameter };
      }
    }
  }
  return null;
}

type AchievementMetric = "longestStreak" | "activeDays" | "totalContributions" | "reviews" | "pullRequests" | "totalCommits";

/** Ordered by priority: rare consistency milestones, then annual volume and smaller earned milestones. */
const achievements = [
  { text: "365+ DAY STREAK ★ YEAR IN MOTION", title: ["YEAR IN", "MOTION"], detail: "365+ DAY STREAK", metric: "longestStreak", threshold: 365 },
  { text: "ACTIVE 300+ DAYS ★ YEAR REGULAR", title: ["YEAR", "REGULAR"], detail: "300+ ACTIVE DAYS", metric: "activeDays", threshold: 300 },
  { text: "100+ DAY STREAK ★ CENTURY STREAK", title: ["CENTURY", "STREAK"], detail: "100+ DAY STREAK", metric: "longestStreak", threshold: 100 },
  { text: "10000+ ★ TEN-K YEAR", title: ["TEN-K", "YEAR"], detail: "10000+ THIS YEAR", metric: "totalContributions", threshold: 10000 },
  { text: "30+ DAY STREAK ★ STREAK KEEPER", title: ["STREAK", "KEEPER"], detail: "30+ DAY STREAK", metric: "longestStreak", threshold: 30 },
  { text: "ACTIVE 200+ DAYS ★ 200-DAY CLUB", title: ["200-DAY", "CLUB"], detail: "200+ ACTIVE DAYS", metric: "activeDays", threshold: 200 },
  { text: "1000+ ★ FOUR-FIGURE YEAR", title: ["FOUR-FIGURE", "YEAR"], detail: "1000+ THIS YEAR", metric: "totalContributions", threshold: 1000 },
  { text: "100+ CODE REVIEWS ★ REVIEW CHAMPION", title: ["REVIEW", "CHAMPION"], detail: "100+ CODE REVIEWS", metric: "reviews", threshold: 100 },
  { text: "100+ PULL REQUESTS ★ PR BUILDER", title: ["PR", "BUILDER"], detail: "100+ PULL REQUESTS", metric: "pullRequests", threshold: 100 },
  { text: "500+ COMMITS ★ COMMIT CRAFTER", title: ["COMMIT", "CRAFTER"], detail: "500+ COMMITS", metric: "totalCommits", threshold: 500 },
  { text: "ACTIVE 100+ DAYS ★ HUNDRED-DAY CLUB", title: ["HUNDRED-DAY", "CLUB"], detail: "100+ ACTIVE DAYS", metric: "activeDays", threshold: 100 },
  { text: "7+ DAY STREAK ★ WEEK IN MOTION", title: ["WEEK IN", "MOTION"], detail: "7+ DAY STREAK", metric: "longestStreak", threshold: 7 },
] as const satisfies readonly { text: string; title: readonly string[]; detail: string; metric: AchievementMetric; threshold: number }[];

export type ReceiptAchievement = (typeof achievements)[number];

/** Unknown or incomplete activity never earns a seal; only the first exact, reached milestone is used. */
export function chooseReceiptAchievement(snapshot: ContributionSnapshot, stats: ContributionStats): ReceiptAchievement | null {
  if (!snapshot.available || !stats.calendarComplete) return null;
  return achievements.find((achievement) => {
    const count = stats[achievement.metric];
    return count !== null && Number.isSafeInteger(count) && count >= achievement.threshold;
  }) ?? null;
}

export function isReceiptSealText(text: string): boolean {
  return achievements.some((achievement) => achievement.text === text);
}

/** A receipt keeps the same impression on reload and in every downloaded format. */
export function receiptSealSeed(lines: readonly ReceiptLine[]): string {
  return ["BILL NO.", "ACCOUNT", "YEAR"].map((label) => {
    const line = lines.find((item) => item.type === "pair" && item.label === label);
    return line?.type === "pair" ? line.value : "";
  }).join("|");
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function arcGlyphs(text: string, side: "top" | "bottom" = "top"): SealGlyph[] {
  const characters = Array.from(text);
  const span = Math.min(146, (characters.length - 1) * 8.8);
  return characters.map((character, index) => {
    const progress = span * index / Math.max(1, characters.length - 1);
    // Bottom letters read left to right along the lower bowl instead of turning upside down.
    const angle = side === "top" ? -90 - span / 2 + progress : 90 + span / 2 - progress;
    const radians = angle * Math.PI / 180;
    return { text: character, x: 66 + Math.cos(radians) * 49, y: 66 + Math.sin(radians) * 49,
      size: side === "bottom" && characters.length > 15 ? 9 : 10, rotation: side === "top" ? angle + 90 : angle - 90 };
  });
}

/* GitHubLogoIcon from the project's existing Radix icon set.
 * MIT License — Copyright (c) 2022 WorkOS.
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
const githubLogoPath = "M7.49933 0.25C3.49635 0.25 0.25 3.49593 0.25 7.50024C0.25 10.703 2.32715 13.4206 5.2081 14.3797C5.57084 14.446 5.70302 14.2222 5.70302 14.0299C5.70302 13.8576 5.69679 13.4019 5.69323 12.797C3.67661 13.235 3.25112 11.825 3.25112 11.825C2.92132 10.9874 2.44599 10.7644 2.44599 10.7644C1.78773 10.3149 2.49584 10.3238 2.49584 10.3238C3.22353 10.375 3.60629 11.0711 3.60629 11.0711C4.25298 12.1788 5.30335 11.8588 5.71638 11.6732C5.78225 11.205 5.96962 10.8854 6.17658 10.7043C4.56675 10.5209 2.87415 9.89918 2.87415 7.12104C2.87415 6.32925 3.15677 5.68257 3.62053 5.17563C3.54576 4.99226 3.29697 4.25521 3.69174 3.25691C3.69174 3.25691 4.30015 3.06196 5.68522 3.99973C6.26337 3.83906 6.8838 3.75895 7.50022 3.75583C8.1162 3.75895 8.73619 3.83906 9.31523 3.99973C10.6994 3.06196 11.3069 3.25691 11.3069 3.25691C11.7026 4.25521 11.4538 4.99226 11.3795 5.17563C11.8441 5.68257 12.1245 6.32925 12.1245 7.12104C12.1245 9.9063 10.4292 10.5192 8.81452 10.6985C9.07444 10.9224 9.30633 11.3648 9.30633 12.0413C9.30633 13.0102 9.29742 13.7922 9.29742 14.0299C9.29742 14.2239 9.42828 14.4496 9.79591 14.3788C12.6746 13.4179 14.75 10.7025 14.75 7.50024C14.75 3.49593 11.5036 0.25 7.49933 0.25Z";

/** One stable, slightly rotated impression is positioned around the QR by each consumer. */
export function createReceiptSeal(lines: readonly ReceiptLine[]): ReceiptSeal | null {
  const achievement = achievements.find((candidate) => lines.some((line) => line.type === "text" && line.align === "center" && line.text === candidate.text));
  if (!achievement) return null;
  const hash = hashSeed(receiptSealSeed(lines));
  return {
    text: achievement.text,
    diameter: 132,
    top: 0,
    centerX: 164 + (hash >>> 1) % 33,
    rotation: (2 + (hash >>> 8) % 5) * (hash % 2 === 0 ? -1 : 1),
    placement: (hash >>> 17) % 2 === 0 ? "before" : "after",
    ink: "#9b5148",
    opacity: 0.8,
    rings: [{ radius: 61, width: 1.7, dash: "31 .7 20 1 15 .6", opacity: 0.6 }, { radius: 58, width: 0.8, opacity: 0.6 }],
    glyphs: [
      ...arcGlyphs("GITHUB ACHIEVEMENT"),
      ...achievement.title.map((text, index) => ({ text, x: 66, y: 63 + index * 17, size: text.length > 8 ? 14 : 16, rotation: 0 })),
      ...arcGlyphs(achievement.detail, "bottom"),
    ],
    logo: { x: 54, y: 30, scale: 24 / 15, path: githubLogoPath },
  };
}

/** The same vector impression is used in HTML and standalone SVG downloads. */
export function renderReceiptSealSvg(seal: ReceiptSeal, position: { x?: number; y?: number } = {}): string {
  const center = seal.diameter / 2;
  const rings = seal.rings.map((ring) => `<circle cx="${center}" cy="${center}" r="${ring.radius}" fill="none" stroke="${seal.ink}" stroke-width="${ring.width}" opacity="${ring.opacity ?? 1}"${ring.dash ? ` stroke-dasharray="${ring.dash}"` : ""}/>`).join("");
  const glyphs = seal.glyphs.map((glyph) => `<text x="${glyph.x}" y="${glyph.y}" font-size="${glyph.size}" text-anchor="middle" dominant-baseline="central" font-weight="700" font-family="'Courier New',Courier,monospace" transform="rotate(${glyph.rotation} ${glyph.x} ${glyph.y})">${glyph.text}</text>`).join("");
  const logo = `<path class="seal-github-logo" d="${seal.logo.path}" fill-rule="evenodd" transform="translate(${seal.logo.x} ${seal.logo.y}) scale(${seal.logo.scale})"/>`;
  return `<svg class="receipt-seal" x="${position.x ?? 0}" y="${position.y ?? 0}" width="${seal.diameter}" height="${seal.diameter}" viewBox="0 0 ${seal.diameter} ${seal.diameter}" aria-hidden="true"><g fill="${seal.ink}" opacity="${seal.opacity}" transform="rotate(${seal.rotation} ${center} ${center})">${rings}${glyphs}${logo}</g></svg>`;
}
