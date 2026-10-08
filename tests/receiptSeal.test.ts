import assert from "node:assert/strict";
import test from "node:test";
import { buildReceiptLines } from "../lib/receiptLines";
import { chooseReceiptAchievement, createReceiptSeal, getReceiptSealOverlay, isReceiptSealText, renderReceiptSealSvg, sealInkOverlap } from "../lib/receiptSeal";
import type { ContributionSnapshot, ContributionStats } from "../lib/types";

const snapshot: ContributionSnapshot = {
  username: "octocat", displayName: "Octocat", avatarUrl: null, year: 2025,
  source: "public", sourceMessage: "Exact public calendar", available: true,
  fetchedAt: "2025-12-31T12:00:00Z", periodStart: "2025-01-01", periodEnd: "2025-12-31",
  days: [], repositories: [], totalContributions: 0, totalCommits: null,
  pullRequests: null, reviews: null, issues: null, restrictedContributions: null,
};
const emptyStats: ContributionStats = {
  totalContributions: 0, totalCommits: null, pullRequests: null, reviews: null,
  issues: null, otherContributions: null, activeDays: 0, currentStreak: 0, longestStreak: 0,
  busiestDay: null, calendarComplete: true, bestMonth: null, longestBreak: 365, topRepos: [],
};

test("only the highest-priority exact milestone wins when several achievements are earned", () => {
  const stats = { ...emptyStats, longestStreak: 365, activeDays: 365, totalContributions: 20000,
    reviews: 100, pullRequests: 100, totalCommits: 500 };
  assert.equal(chooseReceiptAchievement(snapshot, stats)?.text, "365+ DAY STREAK ★ YEAR IN MOTION");
  assert.equal(chooseReceiptAchievement(snapshot, { ...stats, longestStreak: 100 })?.text, "ACTIVE 300+ DAYS ★ YEAR REGULAR");
  assert.equal(chooseReceiptAchievement(snapshot, { ...stats, longestStreak: 100, activeDays: 200 })?.text, "100+ DAY STREAK ★ CENTURY STREAK");
  assert.equal(chooseReceiptAchievement(snapshot, { ...stats, longestStreak: 30, activeDays: 200 })?.text, "10000+ ★ TEN-K YEAR");
  const lines = buildReceiptLines(snapshot, stats);
  assert.equal(lines.filter((line) => line.type === "text" && isReceiptSealText(line.text)).length, 1);
});

test("unknown, incomplete, invalid, and unearned activity cannot produce an achievement", () => {
  const earned = { ...emptyStats, totalContributions: 20000, longestStreak: 365, activeDays: 365 };
  assert.equal(chooseReceiptAchievement({ ...snapshot, available: false }, earned), null);
  assert.equal(chooseReceiptAchievement(snapshot, { ...earned, calendarComplete: false }), null);
  assert.equal(chooseReceiptAchievement(snapshot, emptyStats), null);
  assert.equal(chooseReceiptAchievement(snapshot, { ...emptyStats, longestStreak: 6, totalContributions: 999, activeDays: 99 }), null);
  assert.equal(chooseReceiptAchievement(snapshot, { ...emptyStats, totalContributions: Infinity, reviews: Number.NaN }), null);
});

test("new achievements use reached thresholds and never infer an unavailable breakdown", () => {
  for (const [stats, expected] of [
    [{ ...emptyStats, reviews: 100, totalContributions: 100 }, "100+ CODE REVIEWS ★ REVIEW CHAMPION"],
    [{ ...emptyStats, pullRequests: 100, totalContributions: 100 }, "100+ PULL REQUESTS ★ PR BUILDER"],
    [{ ...emptyStats, totalCommits: 500, totalContributions: 500 }, "500+ COMMITS ★ COMMIT CRAFTER"],
    [{ ...emptyStats, activeDays: 100, totalContributions: 100 }, "ACTIVE 100+ DAYS ★ HUNDRED-DAY CLUB"],
    [{ ...emptyStats, longestStreak: 7, totalContributions: 7 }, "7+ DAY STREAK ★ WEEK IN MOTION"],
  ] as const) assert.equal(chooseReceiptAchievement(snapshot, stats)?.text, expected);
  assert.equal(chooseReceiptAchievement(snapshot, { ...emptyStats, reviews: 99, pullRequests: 99, totalCommits: 499 }), null);
  assert.equal(chooseReceiptAchievement(snapshot, { ...emptyStats, totalContributions: 500 }), null);
});

test("the achievement marker follows the total before repositories and footer content", () => {
  const stats = { ...emptyStats, totalContributions: 1000,
    topRepos: [{ name: "octocat/project", commits: 123, isPrivate: false, url: "https://github.com/octocat/project" }] };
  const lines = buildReceiptLines(snapshot, stats);
  const total = lines.findIndex((line) => line.type === "total");
  assert.deepEqual(lines[total + 1], { type: "text", text: "1000+ ★ FOUR-FIGURE YEAR", align: "center" });
  assert.ok(lines.findIndex((line) => line.type === "pair" && line.label === "octocat/project") > total + 1);
});

test("the lower detail follows a readable circle and impressions stay stable near the center", () => {
  const lines = buildReceiptLines(snapshot, { ...emptyStats, totalContributions: 1000 });
  const seal = createReceiptSeal(lines)!;
  assert.deepEqual(createReceiptSeal(lines), seal);
  assert.equal(seal.top, 0, "Placement overlays existing ink instead of reserving a row");
  const detail = seal.glyphs.filter((glyph) => glyph.y > 82);
  assert.equal(detail.map((glyph) => glyph.text).join(""), "1000+ THIS YEAR");
  assert.ok(detail.every((glyph, index) => index === 0 || detail[index - 1].x < glyph.x));
  assert.ok(detail.every((glyph) => Math.abs(glyph.rotation) < 90), "Bottom characters remain upright");
  assert.ok(new Set(detail.map((glyph) => glyph.y)).size > 2, "Detail follows the lower arc");
  assert.ok(renderReceiptSealSvg(seal).includes('class="seal-github-logo"'));
  const placements = new Set<string>();
  const modes = new Set<string>();
  for (let index = 0; index < 100; index += 1) {
    const variant = lines.map((line) => line.type === "pair" && line.label === "ACCOUNT"
      ? { ...line, value: `@profile${index}` } : line);
    const impression = createReceiptSeal(variant)!;
    assert.ok(impression.centerX >= 164 && impression.centerX <= 196);
    assert.ok(Math.abs(impression.rotation) >= 2 && Math.abs(impression.rotation) <= 6);
    placements.add(`${impression.centerX}:${impression.rotation}`);
    modes.add(`${impression.placement}:${Math.sign(impression.rotation)}`);
    assert.equal(createReceiptSeal(variant)!.placement, impression.placement);
  }
  assert.ok(placements.size > 1);
  assert.equal(modes.size, 4, "Before/after selection varies independently of tilt direction");
});

test("a receipt without a QR still uses a smaller overlay in its existing footer", () => {
  const seal = createReceiptSeal(buildReceiptLines(snapshot, { ...emptyStats, totalContributions: 1000 }))!;
  const placement = getReceiptSealOverlay(seal, { width: 360, top: 100, bottom: 400,
    protectedAreas: [{ x: 128, y: 280, width: 104, height: 104 }] })!;
  const diameter = placement.scale * seal.diameter;
  assert.equal(diameter, 96);
  assert.ok(placement.x >= 80 && placement.x + diameter <= 280);
  assert.ok(placement.y + diameter / 2 >= 100);
  assert.ok(placement.y + diameter <= 278);
});

test("before and after preferences occupy different safe regions around the QR", () => {
  const seal = createReceiptSeal(buildReceiptLines(snapshot, { ...emptyStats, totalContributions: 1000 }))!;
  const qr = { x: 128, y: 280, width: 104, height: 104 };
  const barcode = { x: 40, y: 426, width: 280, height: 32 };
  const bounds = { width: 360, top: 100, bottom: 482, qrArea: qr, protectedAreas: [barcode] };
  const before = getReceiptSealOverlay({ ...seal, placement: "before" }, bounds)!;
  const after = getReceiptSealOverlay({ ...seal, placement: "after" }, bounds)!;
  assert.equal(before.scale * seal.diameter, 96);
  assert.equal(after.scale * seal.diameter, 96);
  assert.ok(before.y + 96 <= qr.y - 2, "Before seal sits above the complete QR quiet zone");
  assert.ok(after.y + 48 >= qr.y + qr.height - 96 * .3, "After seal flanks the lower QR");
  assert.ok(after.y + 96 > qr.y + qr.height, "Its lower half falls after the QR");
  assert.ok(after.x + 96 <= qr.x - 2 || after.x >= qr.x + qr.width + 2);
  assert.notDeepEqual(before, after);
  for (const placement of [before, after]) for (const area of [qr, barcode]) {
    const overlaps = placement.x < area.x + area.width + 2 && placement.x + 96 > area.x - 2
      && placement.y < area.y + area.height + 2 && placement.y + 96 > area.y - 2;
    assert.equal(overlaps, false);
  }
});

test("a tight QR/barcode footer fits a reduced seal without extending the paper", () => {
  const seal = createReceiptSeal(buildReceiptLines(snapshot, { ...emptyStats, totalContributions: 1000 }))!;
  for (const width of [300, 360]) {
    const qr = { x: width / 2 - 52, y: 457, width: 104, height: 104 };
    const barcode = { x: 40, y: 595, width: width - 80, height: 32 };
    for (const mode of ["before", "after"] as const) {
      const placement = getReceiptSealOverlay({ ...seal, placement: mode }, {
        width, top: 360, bottom: 656, qrArea: qr, protectedAreas: [barcode],
      })!;
      const diameter = seal.diameter * placement.scale;
      assert.ok(diameter >= 80 && diameter <= 96);
      assert.ok(placement.x >= 14 && placement.x + diameter <= width - 14);
      assert.ok(placement.y + diameter <= 656);
      for (const area of [qr, barcode]) {
        const overlaps: boolean = placement.x < area.x + area.width + 2 && placement.x + diameter > area.x - 2
          && placement.y < area.y + area.height + 2 && placement.y + diameter > area.y - 2;
        assert.equal(overlaps, false);
      }
    }
  }
});

test("an after preference falls back above an oversized QR rather than covering it", () => {
  const seal = createReceiptSeal(buildReceiptLines(snapshot, { ...emptyStats, totalContributions: 1000 }))!;
  const qr = { x: 84, y: 280, width: 192, height: 192 };
  const placement = getReceiptSealOverlay({ ...seal, placement: "after" }, {
    width: 360, top: 100, bottom: 500, qrArea: qr,
  })!;
  assert.equal(placement.scale * seal.diameter, 96);
  assert.ok(placement.y + 96 <= qr.y - 2);
});

test("impossible or invalid overlay bounds never obscure a protected code", () => {
  const seal = createReceiptSeal(buildReceiptLines(snapshot, { ...emptyStats, totalContributions: 1000 }))!;
  assert.equal(getReceiptSealOverlay(seal, { width: 360, top: 100, bottom: 180,
    protectedAreas: [{ x: 0, y: 101, width: 360, height: 79 }] }), null);
  assert.equal(getReceiptSealOverlay(seal, { width: 360, top: 100, bottom: 100 }), null);
  assert.equal(getReceiptSealOverlay(seal, { width: Number.NaN, top: 100, bottom: 400 }), null);
  assert.equal(getReceiptSealOverlay(seal, { width: 360, top: 100, bottom: 400,
    qrArea: { x: 128, y: Number.NaN, width: 104, height: 104 } }), null);
  assert.equal(getReceiptSealOverlay(seal, { width: 360, top: 100, bottom: 400,
    protectedAreas: [{ x: 40, y: 200, width: -10, height: 32 }] }), null);
});

test("a text wall above the QR sends the seal to the empty flank beside it", () => {
  assert.equal(sealInkOverlap(0, 0, 96, []), 0);
  assert.equal(sealInkOverlap(0, 0, 96, [{ x: 10, y: 10, width: 0, height: 10 }]), 0);
  assert.equal(sealInkOverlap(0, 0, 100, [{ x: 50, y: 50, width: 100, height: 100 }]), 2500);
  const seal = createReceiptSeal(buildReceiptLines(snapshot, { ...emptyStats, totalContributions: 1000 }))!;
  const qr = { x: 128, y: 280, width: 104, height: 104 };
  const barcode = { x: 40, y: 426, width: 280, height: 32 };
  const bounds = { width: 360, top: 100, bottom: 482, qrArea: qr, protectedAreas: [barcode] };
  const plain = getReceiptSealOverlay({ ...seal, placement: "before" }, bounds)!;
  assert.ok(plain.y + 96 <= qr.y - 2, "Without ink data the centered impression still wins");
  // Footer rows fill the band directly above the QR, leaving the flanks empty.
  const ink: { x: number; y: number; width: number; height: number }[] = [
    { x: 24, y: plain.y, width: 312, height: 96 },
  ];
  const placed = getReceiptSealOverlay({ ...seal, placement: "before" }, { ...bounds, inkAreas: ink })!;
  assert.ok(placed.x + 96 <= qr.x - 2 || placed.x >= qr.x + qr.width + 2,
    "The seal flanks the QR instead of burying readable rows");
  assert.equal(sealInkOverlap(placed.x, placed.y, 96, ink), 0);
  for (const area of [qr, barcode]) {
    const overlaps = placed.x < area.x + area.width + 2 && placed.x + 96 > area.x - 2
      && placed.y < area.y + area.height + 2 && placed.y + 96 > area.y - 2;
    assert.equal(overlaps, false);
  }
});
