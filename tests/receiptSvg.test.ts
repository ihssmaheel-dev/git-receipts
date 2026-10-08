import assert from "node:assert/strict";
import test from "node:test";
import jsQR from "jsqr";
import { BinaryBitmap, BitArray, Code128Reader, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";
import { createQrPath, receiptPermalink, receiptQrTarget } from "../lib/qr";
import { layoutReceipt, receiptInkAreas, receiptPaperMargin, receiptTextWidth } from "../lib/receiptLayout";
import { parseReceiptRequest } from "../lib/receiptRequest";
import { escapeXml, renderReceiptSvg } from "../lib/receiptSvg";
import { outOfPaperSnapshot } from "../lib/receiptData";
import { sealInkOverlap } from "../lib/receiptSeal";
import { buildReceiptLines } from "../lib/receiptLines";
import { calculateStats } from "../lib/stats";
import type { ReceiptData } from "../lib/types";

const data: ReceiptData = {
  snapshot: {
    username: "demo",
    displayName: "Demo",
    avatarUrl: null,
    year: 2025,
    source: "demo",
    sourceMessage: "Demo data",
    available: true,
    rateLimited: false,
    fetchedAt: "2025-12-31T00:00:00Z",
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    days: [],
    repositories: [],
    totalContributions: 1234,
    totalCommits: 1234,
    pullRequests: 0,
    reviews: 0,
    issues: 0,
    restrictedContributions: 0,
  },
  stats: {
    totalContributions: 1234,
    totalCommits: 1234,
    pullRequests: 0,
    reviews: 0,
    issues: 0,
    otherContributions: 0,
    activeDays: 0,
    currentStreak: 0,
    longestStreak: 0,
    busiestDay: null,
    calendarComplete: true,
    bestMonth: null,
    longestBreak: null,
    topRepos: [],
  },
  lines: [
    { type: "heading", text: "COMMIT PRINTER" },
    { type: "pair", label: 'repo<&"', value: "123" },
    { type: "text", text: "<script>alert('x')</script>" },
    { type: "total", label: "CONTRIBUTIONS", value: 1234 },
  ],
};

test("SVG escapes repository names and injected markup, and preserves shared totals", () => {
  const svg = renderReceiptSvg({ data, animated: false });
  assert.ok(svg.includes("repo&lt;&amp;&quot;"));
  assert.ok(svg.includes("&lt;script&gt;alert(&apos;x&apos;)&lt;/script&gt;"));
  assert.ok(!svg.includes("<script"));
  assert.ok(svg.includes(">1,234</text>"));
  assert.equal(escapeXml("\u0000A&B<\"'>"), "A&amp;B&lt;&quot;&apos;&gt;");
});

test("README animation runs once, honors reduced motion, and can be disabled", () => {
  const svg = renderReceiptSvg({ data });
  assert.ok(svg.includes("steps(42,end) 0.35s 1 both"));
  assert.ok(svg.includes("prefers-reduced-motion:reduce"));
  assert.ok(!svg.includes("infinite"));
  assert.ok(!renderReceiptSvg({ data, animated: false }).includes("@keyframes"));
  assert.ok(renderReceiptSvg({ data, theme: "dark" }).includes('fill="#2c3338"'));
  assert.ok(svg.includes('width="360"'));
  assert.ok(!svg.includes("housing"));
});

test("QR modules decode to the exact selected receipt, including auto-version long URLs", () => {
  for (const url of [receiptPermalink("https://commit-printer.example", "octocat", 2025), `https://example.com/${"a".repeat(300)}?user=octocat&year=2025`]) {
    const qr = createQrPath(url);
    const scale = 6;
    const pixels = (qr.size + 8) * scale;
    const image = new Uint8ClampedArray(pixels * pixels * 4).fill(255);
    for (const match of qr.path.matchAll(/M(\d+) (\d+)h(\d+)v1H\d+z/g)) {
      const column = Number(match[1]);
      const row = Number(match[2]);
      const width = Number(match[3]);
      for (let y = (row + 4) * scale; y < (row + 5) * scale; y += 1) {
        for (let x = (column + 4) * scale; x < (column + 4 + width) * scale; x += 1) {
          const index = (y * pixels + x) * 4;
          image[index] = image[index + 1] = image[index + 2] = 0;
        }
      }
    }
    assert.equal(jsQR(image, pixels, pixels)?.data, url);
  }
});

test("QR quiet zones use the paper color and decode in both receipt themes", () => {
  const url = "https://github.com/octocat";
  const qr = createQrPath(url);
  for (const theme of ["light", "dark"] as const) {
    const svg = renderReceiptSvg({ data, qr, theme, animated: false });
    const markup = svg.match(/<svg class="receipt-qr"[\s\S]*?<\/svg>/)![0];
    const background = markup.match(/<rect[^>]*fill="(#[a-f0-9]+)"/)![1];
    const foreground = markup.match(/<path[^>]*fill="(#[a-f0-9]+)"/)![1];
    assert.equal(background, theme === "light" ? "#f9f8f3" : "#2c3338");
    assert.ok(!svg.includes("paper-grain"), "Paper and quiet zone have one flat background");
    const rgb = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
    const scale = 6;
    const pixels = (qr.size + 8) * scale;
    const image = new Uint8ClampedArray(pixels * pixels * 4);
    for (let index = 0; index < image.length; index += 4) image.set([...rgb(background), 255], index);
    for (const match of qr.path.matchAll(/M(\d+) (\d+)h(\d+)v1H\d+z/g)) {
      for (let y = (Number(match[2]) + 4) * scale; y < (Number(match[2]) + 5) * scale; y += 1) {
        for (let x = (Number(match[1]) + 4) * scale; x < (Number(match[1]) + 4 + Number(match[3])) * scale; x += 1) {
          image.set([...rgb(foreground), 255], (y * pixels + x) * 4);
        }
      }
    }
    if (theme === "light") {
      assert.equal(jsQR(image, pixels, pixels)?.data, url, "Light QR stays readable");
    } else {
      // Inverted codes need a decoder's inverted-luminance pass; ZXing independently
      // verifies the pale modules on the same charcoal paper, with its quiet zone.
      const rgbPixels = new Int32Array(pixels * pixels);
      for (let pixel = 0; pixel < rgbPixels.length; pixel += 1) {
        rgbPixels[pixel] = image[pixel * 4] << 16 | image[pixel * 4 + 1] << 8 | image[pixel * 4 + 2];
      }
      const source = new RGBLuminanceSource(rgbPixels, pixels, pixels).invert();
      assert.equal(new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText(), url, "Dark QR stays readable");
    }
  }
});

test("receipt number footer is a Code 128 barcode that an independent reader decodes exactly", () => {
  const qr = createQrPath("https://github.com/octocat");
  for (const number of ["2025-0-0", "2025-1234-200", "2026-999999999999-366"]) {
    const lines: ReceiptData["lines"] = [
      ...data.lines,
      { type: "text", text: "30+ DAY STREAK ★ STREAK KEEPER", align: "center" },
      { type: "footer", text: `No. ${number}` },
    ];
    const svg = renderReceiptSvg({ data: { ...data, lines }, qr, animated: false });
    const markup = svg.match(/<svg class="receipt-barcode"[\s\S]*?<\/svg>/)![0];
    assert.match(markup, /<rect class="barcode-paper"[^>]*fill="#f9f8f3"/,
      "The full barcode bounds mask animated stamp ink with the same receipt paper");
    const darkMarkup = renderReceiptSvg({ data: { ...data, lines }, qr, theme: "dark", animated: false })
      .match(/<svg class="receipt-barcode"[\s\S]*?<\/svg>/)![0];
    assert.match(darkMarkup, /<rect class="barcode-paper"[^>]*fill="#2c3338"/,
      "Charcoal receipts protect barcode quiet spaces with matching paper");
    const moduleWidth = Number(markup.match(/viewBox="0 0 (\d+) /)![1]);
    const scale = 4;
    const row = new BitArray(moduleWidth * scale);
    for (const rectangle of markup.matchAll(/<rect x="(\d+)" y="0" width="(\d+)"/g)) {
      row.setRange(Number(rectangle[1]) * scale, (Number(rectangle[1]) + Number(rectangle[2])) * scale);
    }
    assert.equal(new Code128Reader().decodeRow(16, row).getText(), number);
    assert.ok(row.getNextSet(0) >= 10 * scale, "Left quiet zone keeps ten modules clear");
    const layout = layoutReceipt(lines, { qr });
    const barcode = layout.elements.find((element) => element.type === "barcode")!;
    const receiptNo = layout.elements.find((element) => element.type === "text" && element.value === `No. ${number}`)!;
    const qrPlacement = layout.elements.find((element) => element.type === "qr")!;
    assert.ok(barcode.y > qrPlacement.y + qrPlacement.width);
    assert.ok(receiptNo.y > barcode.y + barcode.height);
    assert.ok(svg.includes('class="receipt-seal"'));
  }
  assert.ok(!renderReceiptSvg({ data, animated: false }).includes('class="receipt-barcode"'), "Unknown receipt numbers are omitted");
});

test("one small earned GitHub seal varies around the QR without changing receipt geometry", () => {
  const stats = { ...data.stats, longestStreak: 30, activeDays: 200 };
  const lines = buildReceiptLines(data.snapshot, stats);
  const bill = lines.findIndex((line) => line.type === "pair" && line.label === "BILL NO.");
  const account = lines.findIndex((line) => line.type === "pair" && line.label === "ACCOUNT");
  assert.ok(bill > 0 && bill < account);
  const earned = lines.filter((line) => line.type === "text" && line.text.includes("★"));
  assert.equal(earned.length, 1);
  assert.equal(earned[0].type === "text" && earned[0].text, "30+ DAY STREAK ★ STREAK KEEPER");
  assert.equal(lines.indexOf(earned[0]), lines.findIndex((line) => line.type === "total") + 1);
  const qr = createQrPath("https://github.com/octocat");
  const svg = renderReceiptSvg({ data: { ...data, stats, lines }, qr, animated: false });
  assert.equal((svg.match(/class="receipt-seal"/g) || []).length, 1);
  assert.equal((svg.match(/<circle /g) || []).length, 2);
  assert.ok(svg.includes('opacity="0.8"'));
  assert.ok(svg.includes('viewBox="0 0 132 132"'));
  assert.ok(svg.includes('font-size="16"') && svg.includes('>STREAK</text>') && svg.includes('>KEEPER</text>'));
  assert.ok(!svg.includes('>30+ DAY STREAK</text>'), "The threshold follows the lower circular arc");
  assert.ok(svg.includes('class="seal-github-logo"'));
  assert.ok(!svg.includes('>★</text>'));
  assert.ok(renderReceiptSvg({ data: { ...data, stats, lines }, qr, theme: "dark", animated: false }).includes('fill="#d99b89"'));
  assert.equal(renderReceiptSvg({ data: { ...data, stats, lines }, qr, animated: false }), svg);
  const positions = new Set<string>();
  const qrSides = new Set<"before" | "after">();
  for (let index = 0; index < 20; index += 1) {
    const variant = lines.map((line) => line.type === "pair" && line.label === "ACCOUNT" ? { ...line, value: `@profile${index}` } : line);
    const layout = layoutReceipt(variant, { qr });
    const seal = layout.elements.find((element) => element.type === "seal")!;
    const qrPlacement = layout.elements.find((element) => element.type === "qr")!;
    const diameter = seal.seal.diameter * seal.scale;
    assert.ok(diameter <= 96, "The impression is smaller than the QR");
    assert.ok(seal.x >= 14);
    assert.ok(seal.x + diameter <= layout.width - 14);
    assert.ok(Math.abs(seal.seal.rotation) >= 2 && Math.abs(seal.seal.rotation) <= 6);
    // The winner covers no more text than stamping directly above the QR: an
    // empty flank beside the QR beats burying readable footer rows.
    const ink = receiptInkAreas(layout.elements.filter((element) => element.type !== "seal"));
    const jitter = Math.abs(Math.round(seal.seal.centerX)) % 7;
    const centeredX = Math.max(14, Math.min(layout.width - 14 - diameter,
      layout.width / 2 + (seal.seal.centerX - 180) - diameter / 2));
    const centeredY = qrPlacement.y - diameter - 2 - jitter;
    assert.ok(sealInkOverlap(seal.x, seal.y, diameter, ink) <= sealInkOverlap(centeredX, centeredY, diameter, ink),
      "Impressions favor empty paper over printed rows");
    qrSides.add(seal.seal.placement);
    const barcode = layout.elements.find((element) => element.type === "barcode")!;
    for (const protectedElement of [qrPlacement, barcode]) {
      const protectedHeight = protectedElement.type === "qr" ? protectedElement.width : protectedElement.height;
      assert.ok(seal.x + diameter <= protectedElement.x || seal.x >= protectedElement.x + protectedElement.width
        || seal.y + diameter <= protectedElement.y || seal.y >= protectedElement.y + protectedHeight, "Stamp ink never crosses QR/barcode bounds");
    }
    const withoutAchievement = variant.filter((line) => !(line.type === "text" && line.text.includes("★")));
    const unstamped = layoutReceipt(variant, { qr, showStamp: false });
    assert.equal(unstamped.height, layoutReceipt(withoutAchievement, { qr }).height);
    assert.equal(layout.height, unstamped.height, "Stamping never lengthens the receipt");
    assert.deepEqual(layout.elements.filter((element) => element.type !== "seal"), unstamped.elements, "All printed rows and codes retain identical coordinates");
    assert.equal(layout.elements[0], seal, "Printed black text paints over the faded stamp ink");
    positions.add(`${seal.x}:${seal.y}:${seal.seal.rotation}`);
  }
  assert.ok(positions.size > 1, "Different receipts get different impressions");
  assert.deepEqual([...qrSides].sort(), ["after", "before"], "Receipt seeds choose both sides of the QR");
  const ordinary = layoutReceipt([{ type: "text", text: "THANK YOU ★ KEEP GOING", align: "center" }]);
  assert.ok(!ordinary.elements.some((element) => element.type === "seal"));
  for (const [snapshot, incompleteStats] of [
    [{ ...data.snapshot, available: false }, stats],
    [data.snapshot, { ...stats, calendarComplete: false }],
  ] as const) {
    const unavailableLines = buildReceiptLines(snapshot, incompleteStats);
    assert.ok(!renderReceiptSvg({ data: { snapshot, stats: incompleteStats, lines: unavailableLines }, qr, animated: false }).includes('class="receipt-seal"'));
  }
});

test("optional SVG stamp has one punch after printing and static reduced-motion/export variants", () => {
  const stats = { ...data.stats, longestStreak: 30 };
  const earned = { ...data, stats, lines: buildReceiptLines(data.snapshot, stats) };
  const animated = renderReceiptSvg({ data: earned });
  assert.ok(animated.includes("@keyframes stamp-punch"));
  assert.ok(animated.includes("3.45s 1 both"), "Punch starts after the 3.35-second feed");
  assert.ok(animated.includes("100%{opacity:1;transform:translateY(0) scale(1)}"));
  assert.ok(animated.includes(".stamp-impression{animation:none;opacity:1;transform:none}"));
  const staticSvg = renderReceiptSvg({ data: earned, animated: false });
  assert.ok(staticSvg.includes('class="receipt-seal"'));
  const noQrSeal = layoutReceipt(earned.lines).elements.find((element) => element.type === "seal")!;
  assert.ok(noQrSeal.seal.diameter * noQrSeal.scale <= 96, "The no-QR receipt keeps the same small stamp size");
  assert.ok(!staticSvg.includes("@keyframes"));
  const plainSvg = renderReceiptSvg({ data: earned, showStamp: false });
  assert.ok(!plainSvg.includes('class="receipt-seal"'));
  assert.ok(!plainSvg.includes("stamp-punch"));
  assert.ok(!plainSvg.includes("STREAK KEEPER"), "Descriptions also omit an unselected stamp");
  assert.ok(!plainSvg.includes("30+ DAY STREAK"), "The hidden marker never becomes flat receipt text");
});

test("older multi-achievement lines yield one priority seal and the header number can identify its barcode", () => {
  const lines: ReceiptData["lines"] = [
    { type: "heading", text: "COMMIT PRINTER" },
    { type: "pair", label: "BILL NO.", value: "2025-1234-200" },
    { type: "pair", label: "ACCOUNT", value: "@demo" },
    { type: "total", label: "TOTAL CONTRIBUTIONS", value: 1234 },
    { type: "text", text: "1000+ ★ FOUR-FIGURE YEAR", align: "center" },
    { type: "text", text: "ACTIVE 200+ DAYS ★ 200-DAY CLUB", align: "center" },
    { type: "text", text: "30+ DAY STREAK ★ STREAK KEEPER", align: "center" },
    { type: "divider" },
    { type: "text", text: "THANK YOU FOR SHOWING UP", align: "center" },
    { type: "footer", text: "END OF RECEIPT" },
    { type: "footer", text: "GITHUB DATA - UPDATED HOURLY" },
  ];
  const layout = layoutReceipt(lines, { qr: createQrPath("https://github.com/demo") });
  const seals = layout.elements.filter((element) => element.type === "seal");
  assert.equal(seals.length, 1);
  assert.equal(seals[0].value, "30+ DAY STREAK ★ STREAK KEEPER");
  assert.equal(layout.elements.find((element) => element.type === "barcode")?.barcode.value, "2025-1234-200");
});

test("an out-of-paper receipt prints the empty-tray copy with no totals or codes", () => {
  const empty = outOfPaperSnapshot("octocat", 2025);
  const lines = buildReceiptLines(empty, calculateStats(empty));
  const svg = renderReceiptSvg({ data: { snapshot: empty, stats: calculateStats(empty), lines }, animated: false });
  assert.ok(svg.includes("OUT OF PAPER"));
  assert.ok(!svg.includes("DATA UNAVAILABLE"));
  assert.ok(!svg.includes('class="receipt-barcode"'), "No receipt number means no barcode");
  assert.ok(!svg.includes('class="receipt-seal"'), "Empty trays earn no achievement stamp");
});

test("local QR codes point to an accessible GitHub profile and public QR codes retain the selected year", () => {
  for (const host of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
    assert.deepEqual(receiptQrTarget(host, "octocat", 2025), { url: "https://github.com/octocat", label: "OPEN GITHUB PROFILE" });
  }
  assert.equal(receiptQrTarget("http://localhost:3000", "", 2025).url, "https://github.com");
  assert.deepEqual(receiptQrTarget("https://commit-printer.example", "octocat", 2025), { url: "https://commit-printer.example/?user=octocat&year=2025", label: "OPEN THIS RECEIPT" });
});

test("long repository names and values fit inside thermal paper with no intersecting columns", () => {
  const layout = layoutReceipt([
    { type: "heading", text: "COMMIT PRINTER", detail: "A YEAR OF SHOWING UP" },
    { type: "text", text: `@${"a".repeat(39)}`, align: "center" },
    { type: "pair", label: `owner/${"repository".repeat(10)}`, value: "1,234,567" },
    { type: "pair", label: "BUSIEST DAY", value: "1,234,567,890 CONTRIBUTIONS" },
    { type: "item", qty: 1234, name: "PULL REQUESTS", total: 1234 },
    { type: "total", label: "CONTRIBUTIONS", value: 1234567890 },
  ]);
  const texts = layout.elements.filter((element) => element.type === "text");
  for (const text of texts) {
    const width = receiptTextWidth(text.value, text.size);
    const x = text.x - (text.align === "center" ? width / 2 : text.align === "right" ? width : 0);
    assert.ok(x >= receiptPaperMargin - 0.01, text.value);
    assert.ok(x + width <= layout.width - receiptPaperMargin + 0.01, text.value);
  }
  const baselines = new Map<number, typeof texts>();
  for (const text of texts) baselines.set(text.y, [...(baselines.get(text.y) || []), text]);
  for (const row of baselines.values()) {
    if (row.length < 2) continue;
    const ordered = row.map((text) => ({ start: text.x - (text.align === "right" ? receiptTextWidth(text.value, text.size) : 0), end: text.x + (text.align === "left" ? receiptTextWidth(text.value, text.size) : 0) })).sort((a, b) => a.start - b.start);
    for (let i = 1; i < ordered.length; i += 1) assert.ok(ordered[i - 1].end < ordered[i].start);
  }
});

test("QR auto-selects its size and uses safe module path commands", () => {
  const url = receiptPermalink("https://commit-printer.example", "octocat", 2025);
  const qr = createQrPath(url);
  assert.match(qr.path, /^[M0-9 hvHz]+$/);
  assert.equal(qr.size % 4, 1);
  assert.ok(url.includes("user=octocat&year=2025"));
  assert.equal(new URL(receiptPermalink("https://example.com/?user=demo", "", 2025)).searchParams.has("user"), false);
  const larger = createQrPath(`https://example.com/${"a".repeat(300)}`);
  assert.ok(larger.size > 33);
  assert.ok(renderReceiptSvg({ data, qr, animated: false }).includes(`viewBox="-4 -4 ${qr.size + 8} ${qr.size + 8}"`));
});

test("image request variants validate usernames, years, animation and optional achievement stamp", () => {
  assert.deepEqual(parseReceiptRequest(new URL("https://example.com/api/receipt.svg?user=https%3A%2F%2Fgithub.com%2Foctocat&year=2025&theme=dark&animate=0")), {
    username: "octocat", year: 2025, theme: "dark", animated: false, showStamp: true,
  });
  for (const [stamp, expected] of [["true", true], ["1", true], ["false", false], ["0", false]] as const) {
    const parsed = parseReceiptRequest(new URL(`https://example.com/api/receipt.svg?stamp=${stamp}`));
    assert.ok(!("error" in parsed));
    assert.equal(parsed.showStamp, expected);
  }
  for (const query of ["user=https://evil.example/octocat", "user=octocat/repo", "year=1999", "year=NaN", "year=2025.0", "theme=blue", "animate=forever", "stamp=yes", "stamp=", "stamp=FALSE"]) {
    assert.ok("error" in parseReceiptRequest(new URL(`https://example.com/api/receipt.svg?${query}`)), query);
  }
});
