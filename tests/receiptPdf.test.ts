import assert from "node:assert/strict";
import test from "node:test";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, decodePDFRawStream } from "pdf-lib";
import { createQrPath, receiptPermalink } from "../lib/qr";
import { layoutReceipt } from "../lib/receiptLayout";
import { receiptPdfWidth, renderReceiptPdf } from "../lib/receiptPdf";
import type { ReceiptData } from "../lib/types";

const data: ReceiptData = {
  snapshot: { username: "octocat", displayName: "The Octocat", avatarUrl: null, year: 2025, source: "live", sourceMessage: "GitHub", available: true, fetchedAt: "2025-12-31T00:00:00Z", periodStart: "2025-01-01", periodEnd: "2025-12-31", days: [], repositories: [], totalContributions: 1234, totalCommits: 1234, pullRequests: 0, reviews: 0, issues: 0, restrictedContributions: 0 },
  stats: { totalContributions: 1234, totalCommits: 1234, pullRequests: 0, reviews: 0, issues: 0, otherContributions: 0, activeDays: 200, currentStreak: 0, longestStreak: 24, busiestDay: null, calendarComplete: true, bestMonth: null, longestBreak: null, topRepos: [] },
  lines: [
    { type: "heading", text: "COMMIT PRINTER", detail: "A YEAR OF SHOWING UP" },
    { type: "text", text: "@octocat", align: "center" },
    { type: "pair", label: "YEAR", value: "2025" },
    { type: "divider" },
    { type: "item", qty: 1234, name: "COMMITS", total: 1234 },
    { type: "total", label: "CONTRIBUTIONS", value: 1234 },
    { type: "divider" },
    { type: "pair", label: "LONGEST STREAK", value: "24 DAYS" },
    { type: "footer", text: "GITHUB CONTRIBUTIONS - UPDATED HOURLY" },
  ],
};

test("PDF uses one 80mm page with automatic receipt height, vector text and vector QR modules", async () => {
  const permalink = receiptPermalink("https://commit-printer.example", "octocat", 2025);
  const qr = createQrPath(permalink);
  const bytes = await renderReceiptPdf({ data, qr, permalink });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
  const page = document.getPage(0);
  assert.equal(page.getWidth(), receiptPdfWidth);
  assert.equal(page.getHeight(), layoutReceipt(data.lines, { qr, permalink }).height * receiptPdfWidth / 360);
  const streams = page.node.Contents() as PDFArray;
  const content = Array.from({ length: streams.size() }, (_, index) => new TextDecoder().decode(decodePDFRawStream(document.context.lookup(streams.get(index)) as PDFRawStream).decode())).join("");
  assert.ok(content.includes(" Tj"), "Text stays selectable instead of becoming a bitmap");
  assert.ok((content.match(/\nf\n/g) || []).length > 100, "QR squares stay vector filled paths");
  assert.ok(content.includes(Buffer.from("@octocat").toString("hex").toUpperCase()));
  assert.ok(content.includes(Buffer.from("1,234").toString("hex").toUpperCase()));
  assert.ok(!content.includes(" Do"), "No image XObjects are used");
});

test("PDF footer link points to the exact selected receipt and annotation stays inside paper", async () => {
  const permalink = receiptPermalink("https://commit-printer.example", "octocat", 2025);
  const document = await PDFDocument.load(await renderReceiptPdf({ data, qr: createQrPath(permalink), permalink }));
  const page = document.getPage(0);
  const annotations = page.node.Annots()!;
  assert.ok(annotations.size() > 0);
  for (let index = 0; index < annotations.size(); index += 1) {
    const annotation = document.context.lookup(annotations.get(index), PDFDict);
    const action = annotation.lookup(PDFName.of("A"), PDFDict);
    assert.equal(action.lookup(PDFName.of("URI"), PDFString).decodeText(), permalink);
    const rect = annotation.lookup(PDFName.of("Rect"), PDFArray).asArray().map((number) => Number(number.toString()));
    assert.ok(rect[0] >= 0 && rect[2] <= page.getWidth());
    assert.ok(rect[1] >= 0 && rect[3] <= page.getHeight());
  }
});

test("one optional GitHub seal stays vector and keeps the PDF height aligned to shared layout", async () => {
  const lines: ReceiptData["lines"] = [
    ...data.lines,
    { type: "text", text: "30+ DAY STREAK ★ STREAK KEEPER", align: "center" },
    { type: "text", text: "ACTIVE 200+ DAYS ★ 200-DAY CLUB", align: "center" },
    { type: "text", text: "1000+ ★ FOUR-FIGURE YEAR", align: "center" },
    { type: "footer", text: "No. 2025-1234-200" },
  ];
  const qr = createQrPath("https://github.com/octocat");
  const document = await PDFDocument.load(await renderReceiptPdf({ data: { ...data, lines }, qr }));
  const page = document.getPage(0);
  const streams = page.node.Contents() as PDFArray;
  const content = Array.from({ length: streams.size() }, (_, index) => new TextDecoder().decode(decodePDFRawStream(document.context.lookup(streams.get(index)) as PDFRawStream).decode())).join("");
  for (const text of ["STREAK", "KEEPER", "No. 2025-1234-200"]) {
    assert.ok(content.includes(Buffer.from(text).toString("hex").toUpperCase()), text);
  }
  const textContent = Array.from(content.matchAll(/<([A-F0-9]+)> Tj/g), (match) => Buffer.from(match[1], "hex").toString()).join("");
  assert.ok(textContent.includes("GITHUB ACHIEVEMENT"));
  const textRuns = Array.from(content.matchAll(/<([A-F0-9]+)> Tj/g), (match) => Buffer.from(match[1], "hex").toString());
  assert.ok(textRuns.includes("STREAK") && textRuns.includes("KEEPER"), "The achievement uses readable whole-word title lines");
  for (const unchosenText of ["200-DAY CLUB", "FOUR-FIGURE"]) assert.ok(!textContent.includes(unchosenText));
  const noAchievement = lines.filter((line) => !(line.type === "text" && line.text.includes("★")));
  const stampedLayout = layoutReceipt(lines, { qr });
  const stamp = stampedLayout.elements.find((element) => element.type === "seal")!;
  const stampDiameter = stamp.seal.diameter * stamp.scale;
  assert.ok(stampDiameter <= 96, "The exported PDF uses the same smaller impression");
  assert.equal(page.getHeight(), stampedLayout.height * receiptPdfWidth / 360);
  const plainDocument = await PDFDocument.load(await renderReceiptPdf({ data: { ...data, lines }, qr, showStamp: false }));
  const plainPage = plainDocument.getPage(0);
  assert.equal(plainPage.getHeight(), layoutReceipt(noAchievement, { qr }).height * receiptPdfWidth / 360);
  assert.equal(page.getHeight(), plainPage.getHeight(), "A paid-style stamp adds no PDF page length");
  assert.deepEqual(stampedLayout.elements.filter((element) => element.type !== "seal"), layoutReceipt(lines, { qr, showStamp: false }).elements,
    "Stamping leaves every printed row and machine-readable code in place");
  const plainStreams = plainPage.node.Contents() as PDFArray;
  const plainContent = Array.from({ length: plainStreams.size() }, (_, index) => new TextDecoder().decode(decodePDFRawStream(plainDocument.context.lookup(plainStreams.get(index)) as PDFRawStream).decode())).join("");
  const plainText = Array.from(plainContent.matchAll(/<([A-F0-9]+)> Tj/g), (match) => Buffer.from(match[1], "hex").toString()).join("");
  assert.ok(!plainText.includes("KEEPER") && !plainText.includes("30+ DAY STREAK") && !plainText.includes("FOUR-FIGURE"), "Disabled achievements do not become fallback text");
  const graphicsStates = page.node.Resources()!.lookup(PDFName.of("ExtGState"), PDFDict);
  const strokeOpacities = graphicsStates.values().map((value) => document.context.lookup(value, PDFDict).get(PDFName.of("CA"))?.toString());
  assert.ok(strokeOpacities.includes(String(0.8 * 0.6)), "The seal rings are softer than the readable title ink");
  assert.ok((content.match(/\nf\n/g) || []).length > 40, "Barcode and GitHub logo use vector fills");
  assert.ok(!content.includes(" Do"));
});
