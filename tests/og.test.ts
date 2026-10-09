import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactNode } from "react";
import jsQR from "jsqr";
import sharp from "sharp";
import fallback from "../data/fallback.json";
import { siteConfig } from "../lib/config";
import { receiptOgElement, receiptOgImage, receiptOgSize } from "../lib/og";
import { ogSealGlyphPaths } from "../lib/ogSealGlyphs";
import { receiptQrTarget } from "../lib/qr";
import { receiptFromSnapshot, unavailableSnapshot, outOfPaperSnapshot } from "../lib/receiptData";
import { createReceiptSeal } from "../lib/receiptSeal";
import type { ContributionSnapshot, ReceiptData } from "../lib/types";

function publicReceipt(username = "octocat"): ReceiptData {
  const days = Array.from({ length: 31 }, (_, index) => ({
    date: `2025-01-${String(index + 1).padStart(2, "0")}`, count: 40,
  }));
  return receiptFromSnapshot({
    username, displayName: username, avatarUrl: null, year: 2025,
    source: "public", sourceMessage: "Public contribution calendar", available: true,
    rateLimited: false, fetchedAt: "2025-02-01T12:34:00Z",
    periodStart: "2025-01-01", periodEnd: "2025-01-31", days, repositories: [],
    totalContributions: 1240, totalCommits: null, pullRequests: null, reviews: null,
    issues: null, restrictedContributions: null,
  });
}

type ElementRecord = { type: unknown; props: Record<string, unknown>; fontFamily: string };
type TextRecord = { value: string; fontFamily: string };

function inspectTree(node: ReactNode, inheritedFont = "", elements: ElementRecord[] = [], texts: TextRecord[] = []) {
  if (typeof node === "string" || typeof node === "number") {
    texts.push({ value: String(node), fontFamily: inheritedFont });
  } else if (Array.isArray(node)) {
    for (const child of node) inspectTree(child, inheritedFont, elements, texts);
  } else if (isValidElement<Record<string, unknown>>(node)) {
    const props = node.props;
    const style = props.style as { fontFamily?: string } | undefined;
    const fontFamily = style?.fontFamily || inheritedFont;
    elements.push({ type: node.type, props, fontFamily });
    inspectTree(props.children as ReactNode, fontFamily, elements, texts);
  }
  return { elements, texts, text: texts.map((entry) => entry.value).join(" ") };
}

async function raster(data: ReceiptData, showStamp = true) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("OG images must render without outbound requests"); };
  try {
    const response = receiptOgImage(data, { showStamp });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /^image\/png/);
    const png = Buffer.from(await response.arrayBuffer());
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const { data: pixels, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(receiptOgSize, { width: 1200, height: 630 });
    assert.equal(info.width, receiptOgSize.width);
    assert.equal(info.height, receiptOgSize.height);
    assert.equal(info.channels, 4);
    return { png, pixels, width: info.width, height: info.height };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function decodeReceiptQr(image: Awaited<ReturnType<typeof raster>>) {
  return jsQR(new Uint8ClampedArray(image.pixels), image.width, image.height)?.data;
}

test("OG receipts keep printable text in the font-aware renderer instead of a text-bearing SVG image", () => {
  const { elements, texts } = inspectTree(receiptOgElement(publicReceipt()));
  for (const value of ["GIT RECEIPTS", "ACCOUNT", "@octocat", "TOTAL CONTRIBUTIONS", "1,240"]) {
    const matching = texts.filter((entry) => entry.value === value);
    assert.ok(matching.length, `Receipt content ${value} remains visible text`);
    assert.ok(matching.some((entry) => /Geist Mono/.test(entry.fontFamily)), `Receipt content ${value} uses the bundled thermal font`);
  }
  for (const element of elements.filter((entry) => entry.type === "img")) {
    const source = String(element.props.src);
    assert.ok(source.startsWith("data:"), "Raster generation does not fetch remote assets");
    if (source.startsWith("data:image/svg+xml;base64,")) {
      const svg = Buffer.from(source.split(",", 2)[1], "base64").toString();
      assert.ok(!/<text(?:\s|>)/.test(svg), "Embedded SVGs contain paths, never text needing an unavailable system font");
    }
  }
  assert.ok(!elements.some((element) => element.type === "text" || element.type === "textPath"),
    "Nested SVGs also use outlines rather than font-dependent text");
});

test("the OG achievement stamp preserves every letter as finite native vector geometry", () => {
  const data = publicReceipt();
  const seal = createReceiptSeal(data.lines)!;
  const { elements } = inspectTree(receiptOgElement(data));
  const stamp = elements.find((element) => element.type === "svg" && element.props.role === "img");
  assert.ok(stamp, "An earned stamp is a vector image");
  assert.equal(stamp.props["aria-label"], seal.text, "The complete achievement remains identifiable");
  const stampTree = inspectTree(stamp.props.children as ReactNode);
  assert.equal(stampTree.texts.length, 0, "Arc letters avoid CSS text layout rounding at social image size");
  const paths = stampTree.elements.filter((element) => element.type === "path");
  const printedCharacters = seal.glyphs.flatMap((glyph) => Array.from(glyph.text)).filter((character) => character.trim());
  assert.equal(paths.length, printedCharacters.length + 1, "Each top arc, title, and bottom arc letter is preserved alongside the GitHub logo");
  for (const path of paths) {
    assert.match(String(path.props.d), /^M/);
    assert.ok(!/NaN|Infinity|undefined/.test(String(path.props.d)));
  }
  for (const element of stampTree.elements) {
    assert.ok(!/NaN|Infinity|undefined/.test(String(element.props.transform || "")), "All rotated letter positions remain finite");
  }
  for (const character of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-") {
    assert.ok(ogSealGlyphPaths[character], `The local font outlines support achievement character ${character}`);
  }
  const unstamped = inspectTree(receiptOgElement(data, { showStamp: false }));
  assert.ok(!unstamped.elements.some((element) => element.type === "svg" && element.props.role === "img"), "The stamp toggle removes the vector impression completely");
});

test("public, demo, missing-profile, and quota OG receipts retain honest data states", () => {
  const publicText = inspectTree(receiptOgElement(publicReceipt())).text;
  assert.ok(publicText.includes("1,240"));
  assert.ok(publicText.includes("PUBLIC CONTRIBUTION DATA"));
  assert.ok(!publicText.includes("COMMITS") && !publicText.includes("PULL REQUESTS"), "Unknown breakdowns are omitted rather than converted to zero");

  const demoText = inspectTree(receiptOgElement(receiptFromSnapshot(fallback as ContributionSnapshot))).text;
  assert.ok(demoText.includes("DEMO DATA"));
  assert.ok(demoText.includes("SAMPLE PROFILE"));

  for (const snapshot of [unavailableSnapshot("octocat", 2025), outOfPaperSnapshot("octocat", 2025)]) {
    const missing = inspectTree(receiptOgElement(receiptFromSnapshot(snapshot))).text;
    assert.ok(missing.includes(snapshot.rateLimited ? "OUT OF PAPER" : "DATA UNAVAILABLE"));
    assert.ok(!missing.includes("TOTAL CONTRIBUTIONS"), "Failed lookups do not print a fabricated zero total");
    assert.ok(!missing.includes("BILL NO."), "Failed lookups do not receive an activity-derived bill number");
  }
});

test("real 1200x630 OG PNGs render offline and preserve scannable QR codes for receipt variants", async () => {
  for (const data of [
    publicReceipt(),
    receiptFromSnapshot(fallback as ContributionSnapshot),
    receiptFromSnapshot(unavailableSnapshot("octocat", 2025)),
    publicReceipt("a".repeat(39)),
  ]) {
    const image = await raster(data);
    const expected = receiptQrTarget(siteConfig.siteUrl,
      data.snapshot.source === "demo" ? "" : data.snapshot.username, data.snapshot.year).url;
    assert.equal(decodeReceiptQr(image), data.snapshot.available ? expected : undefined,
      data.snapshot.available ? `Rendered ${data.snapshot.source}/${data.snapshot.username} QR remains readable` : "An unavailable lookup does not create a receipt QR");
  }
});

test("OG receipt glyphs render distinct real letter shapes rather than repeated missing-font boxes", async () => {
  const data = publicReceipt();
  const variant = (heading: string): ReceiptData => ({
    ...data,
    lines: data.lines.map((line) => line.type === "heading" ? { ...line, text: heading } : line),
  });
  const narrow = await raster(variant("IIIIIIII"), false);
  const wide = await raster(variant("WWWWWWWW"), false);
  let changedPixels = 0;
  for (let index = 0; index < narrow.pixels.length; index += 4) {
    if (Math.abs(narrow.pixels[index] - wide.pixels[index])
      + Math.abs(narrow.pixels[index + 1] - wide.pixels[index + 1])
      + Math.abs(narrow.pixels[index + 2] - wide.pixels[index + 2]) > 30) changedPixels += 1;
  }
  assert.ok(changedPixels > 150, "Equal-length Latin headings produce visibly different receipt letterforms");
});

test("disabling an earned OG stamp changes its ink without obscuring or changing the QR target", async () => {
  const data = publicReceipt();
  assert.ok(data.lines.some((line) => line.type === "text" && line.text.includes("STREAK KEEPER")), "Fixture earns a seal from exact calendar data");
  const stamped = await raster(data, true);
  const unstamped = await raster(data, false);
  assert.notDeepEqual(stamped.pixels, unstamped.pixels, "The stamp toggle affects the final PNG");
  const expected = receiptQrTarget(siteConfig.siteUrl, data.snapshot.username, data.snapshot.year).url;
  assert.equal(decodeReceiptQr(stamped), expected);
  assert.equal(decodeReceiptQr(unstamped), expected);
});
