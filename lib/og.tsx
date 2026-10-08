import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { siteConfig } from "./config";
import { createQrPath, receiptQrTarget } from "./qr";
import { isReceiptSealText } from "./receiptSeal";
import { layoutReceipt } from "./receiptLayout";
import { renderReceiptSvg } from "./receiptSvg";
import type { ReceiptData, ReceiptLine } from "./types";

export const receiptOgSize = { width: 1200, height: 630 };

function displayLines(lines: ReceiptLine[]): ReceiptLine[] {
  const selected: ReceiptLine[] = [];
  let beforeFirstDivider = true;
  let items = 0;
  let pairs = 0;
  let includedFirstDivider = false;
  let includedTotal = false;

  for (const line of lines) {
    if (line.type === "text" && line.align === "center" && isReceiptSealText(line.text)) {
      selected.push(line);
      continue;
    }
    if (line.type === "heading") selected.push(line);
    else if (line.type === "divider") {
      beforeFirstDivider = false;
      if (!includedFirstDivider) {
        selected.push(line);
        includedFirstDivider = true;
      }
    } else if (line.type === "text" && beforeFirstDivider) selected.push(line);
    else if (line.type === "text" && ["DATA UNAVAILABLE", "ACTIVITY SUMMARY"].includes(line.text)) selected.push(line);
    else if (line.type === "pair" && beforeFirstDivider && ["BILL NO.", "ACCOUNT", "YEAR"].includes(line.label)) selected.push(line);
    else if (line.type === "item" && items++ < 4) selected.push(line);
    else if (line.type === "total") {
      selected.push({ type: "divider" }, line);
      includedTotal = true;
    }
    else if (line.type === "pair" && !beforeFirstDivider && !includedTotal && pairs++ < 2) selected.push(line);
  }
  if (includedTotal) selected.push({ type: "divider" });
  const footers = lines.filter((line) => line.type === "footer" && line.text !== "END OF RECEIPT");
  if (footers.length) selected.push({ type: "spacer" }, ...footers);
  return selected;
}

/** A static share card using the same vector receipt and overlay as downloads. */
export function receiptOgImage(data: ReceiptData, options: { showStamp?: boolean } = {}): ImageResponse {
  const target = receiptQrTarget(siteConfig.siteUrl, data.snapshot.source === "demo" ? "" : data.snapshot.username, data.snapshot.year);
  const qr = createQrPath(target.url);
  const previewData = { ...data, lines: displayLines(data.lines) };
  const previewOptions = { data: previewData, qr, qrLabel: target.label, showStamp: options.showStamp, animated: false };
  const layout = layoutReceipt(previewData.lines, previewOptions);
  const previewWidth = Math.min(338, 546 * layout.width / layout.height);
  const previewHeight = layout.height * previewWidth / layout.width;
  const previewImage = `data:image/svg+xml;base64,${Buffer.from(renderReceiptSvg(previewOptions)).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#e8edf0", color: "#26333c", padding: "42px 75px", alignItems: "center", justifyContent: "space-between", fontFamily: "Geist" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 540, height: "100%", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 19, fontWeight: 600, letterSpacing: -0.7 }}>
            <span style={{ display: "flex", width: 28, height: 26, marginRight: 12, alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, letterSpacing: -0.7, color: "#ffffff", background: "#45657c" }}>GR</span>
            git receipts
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 12, fontWeight: 500, letterSpacing: 2.5, color: "#687985", marginBottom: 19 }}>A RECORD OF SHOWING UP</div>
            <div style={{ display: "flex", fontSize: 65, lineHeight: 1.05, fontWeight: 700, letterSpacing: -3.7 }}>Your GitHub year,</div>
            <div style={{ display: "flex", fontSize: 65, lineHeight: 1.05, fontWeight: 700, letterSpacing: -3.7, color: "#45657c" }}>on paper.</div>
            <div style={{ display: "flex", fontSize: 20, lineHeight: 1.5, color: "#65727c", marginTop: 22, maxWidth: 450 }}>Contributions, quiet persistence, and a receipt worth keeping.</div>
          </div>
          <div style={{ display: "flex", width: "100%", fontSize: data.snapshot.username.length > 26 ? 13 : 17, wordBreak: "break-all", color: "#65727c" }}>
            {data.snapshot.source === "demo" ? "Enter your handle. Print your year." : `@${data.snapshot.username} / ${data.snapshot.year}`}
          </div>
        </div>
        <div style={{ display: "flex", width: previewWidth, height: previewHeight, boxShadow: "0 10px 25px #26333c18", transform: "rotate(2deg)" }}>
          <img src={previewImage} width={previewWidth} height={previewHeight} alt={`GitHub receipt for ${data.snapshot.username}`} />
        </div>
      </div>
    ),
    { ...receiptOgSize, fonts: ogFonts() },
  );
}

let cachedFonts: NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"];

function ogFonts() {
  if (!cachedFonts) {
    const fontRoot = join(process.cwd(), "node_modules", "geist", "dist", "fonts");
    cachedFonts = [
      { name: "Geist", data: readFileSync(join(fontRoot, "geist-sans", "Geist-Regular.ttf")), weight: 400, style: "normal" },
      { name: "Geist", data: readFileSync(join(fontRoot, "geist-sans", "Geist-Bold.ttf")), weight: 700, style: "normal" },
      { name: "Geist Mono", data: readFileSync(join(fontRoot, "geist-mono", "GeistMono-Regular.ttf")), weight: 400, style: "normal" },
      { name: "Geist Mono", data: readFileSync(join(fontRoot, "geist-mono", "GeistMono-Bold.ttf")), weight: 700, style: "normal" },
    ];
  }
  return cachedFonts;
}
