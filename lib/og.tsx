import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { siteConfig } from "./config";
import { createQrPath, receiptQrTarget } from "./qr";
import { isReceiptSealText } from "./receiptSeal";
import { ogSealFont, ogSealGlyphPaths } from "./ogSealGlyphs";
import { layoutReceipt, receiptTextWidth, type ReceiptLayout, type ReceiptSealPlacement } from "./receiptLayout";
import { formatReceiptNumber } from "./receiptLines";
import type { ReceiptData, ReceiptLine } from "./types";

export const receiptOgSize = { width: 1200, height: 630 };
const paperColor = "#faf9f4";
const paperInk = "#292925";

/** Keep the slip readable at sharing size; full receipts retain every row. */
function displayLines(data: ReceiptData): ReceiptLine[] {
  const selected: ReceiptLine[] = [];
  let beforeFirstDivider = true;
  let pairs = 0;
  let includedTotal = false;
  for (const line of data.lines) {
    if (line.type === "text" && line.align === "center" && isReceiptSealText(line.text)) selected.push(line);
    else if (line.type === "heading") selected.push(line);
    else if (line.type === "divider" && beforeFirstDivider) {
      beforeFirstDivider = false;
      selected.push(line);
    } else if (line.type === "text" && beforeFirstDivider) selected.push(line);
    else if (line.type === "pair" && beforeFirstDivider && ["BILL NO.", "ACCOUNT", "YEAR"].includes(line.label)) selected.push(line);
    else if (line.type === "text" && ["DATA UNAVAILABLE", "OUT OF PAPER"].includes(line.text)) selected.push(line);
    else if (line.type === "pair" && !beforeFirstDivider && !includedTotal && pairs++ < 2) selected.push(line);
    else if (line.type === "total") {
      selected.push({ type: "divider" }, line);
      includedTotal = true;
    }
  }
  if (includedTotal) selected.push({ type: "divider" }, { type: "text", text: "THANK YOU FOR SHOWING UP", align: "center" });
  const disclosure = data.snapshot.source === "demo" ? "DEMO DATA - SAMPLE PROFILE"
    : !data.snapshot.available ? "NO ACTIVITY TOTALS AVAILABLE"
    : data.snapshot.source === "fallback" ? "SAVED SNAPSHOT"
    : data.snapshot.source === "public" ? "PUBLIC CONTRIBUTION DATA"
    : "GITHUB DATA - UPDATED HOURLY";
  selected.push({ type: "footer", text: disclosure });
  return selected;
}

function sealElement(element: ReceiptSealPlacement, scale: number) {
  const { seal } = element;
  const zoom = element.scale * scale;
  const diameter = seal.diameter * zoom;
  const center = seal.diameter / 2;
  return (
    <svg key="seal" role="img" aria-label={seal.text} width={diameter} height={diameter} viewBox={`0 0 ${seal.diameter} ${seal.diameter}`} style={{ position: "absolute", left: element.x * scale, top: element.y * scale }}>
      <g fill={seal.ink} opacity={seal.opacity} transform={`rotate(${seal.rotation} ${center} ${center})`}>
        {seal.rings.map((ring, index) => <circle key={index} cx={center} cy={center} r={ring.radius} fill="none" stroke={seal.ink} strokeWidth={ring.width} strokeDasharray={ring.dash} opacity={ring.opacity ?? 1} />)}
        {/* Native vector transforms retain subpixel arc spacing at the small sharing size. */}
        {seal.glyphs.filter((glyph) => glyph.text.trim()).map((glyph, index) => {
          const characters = Array.from(glyph.text);
          const size = glyph.size + (characters.length === 1 ? 2 : 0);
          const emScale = size / ogSealFont.unitsPerEm;
          return <g key={index} transform={`translate(${glyph.x} ${glyph.y}) rotate(${glyph.rotation}) scale(${emScale} ${-emScale}) translate(${-characters.length * ogSealFont.advance / 2} ${-ogSealFont.capHeight / 2})`}>
            {characters.map((character, characterIndex) => {
              const path = ogSealGlyphPaths[character];
              if (path === undefined) throw new Error(`Unsupported OG seal character: ${character}`);
              return path ? <path key={characterIndex} d={path} transform={`translate(${characterIndex * ogSealFont.advance} 0)`} /> : null;
            })}
          </g>;
        })}
        <path d={seal.logo.path} fillRule="evenodd" transform={`translate(${seal.logo.x} ${seal.logo.y}) scale(${seal.logo.scale})`} />
      </g>
    </svg>
  );
}

/** Receipt text uses bundled fonts; the small seal uses precomputed vector letterforms. */
function paperElement(layout: ReceiptLayout) {
  const scale = Math.min(370 / layout.width, 522 / layout.height);
  const width = layout.width * scale;
  const height = layout.height * scale;
  const teeth: string[] = [];
  for (let x = layout.width; x >= 0; x -= 4) teeth.push(`${x},${layout.height - (teeth.length % 2 === 0 ? 4 : 0)}`);
  return (
    <div style={{ display: "flex", position: "relative", width, height, fontFamily: "Geist Mono", color: paperInk, boxShadow: "0 14px 34px #26333c1c" }}>
      <svg width={width} height={height} viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ position: "absolute", left: 0, top: 0 }}>
        <polygon points={`0,0 ${layout.width},0 ${teeth.join(" ")} 0,0`} fill={paperColor} />
      </svg>
      {layout.elements.map((element, index) => {
        if (element.type === "seal") return sealElement(element, scale);
        if (element.type === "text") {
          const textWidth = receiptTextWidth(element.value, element.size) * scale + 1;
          const left = element.x * scale - (element.align === "center" ? textWidth / 2 : element.align === "right" ? textWidth : 0);
          return <div key={index} style={{ display: "flex", position: "absolute", left, top: (element.y - element.size) * scale, width: textWidth, height: element.size * 1.25 * scale, justifyContent: element.align === "right" ? "flex-end" : element.align === "center" ? "center" : "flex-start", alignItems: "center", fontSize: element.size * scale, fontWeight: element.bold ? 700 : 400, lineHeight: 1, whiteSpace: "nowrap" }}>{element.value}</div>;
        }
        if (element.type === "rule") return <div key={index} style={{ display: "flex", position: "absolute", left: element.x * scale, top: element.y * scale, width: element.width * scale, borderTop: "1px dashed #999992" }} />;
        if (element.type === "qr") return <svg key={index} width={element.width * scale} height={element.width * scale} viewBox={`-4 -4 ${element.qr.size + 8} ${element.qr.size + 8}`} style={{ position: "absolute", left: element.x * scale, top: element.y * scale }}>
          <rect x={-4} y={-4} width={element.qr.size + 8} height={element.qr.size + 8} fill={paperColor} />
          <path d={element.qr.path} fill={paperInk} />
        </svg>;
        return <svg key={index} width={element.width * scale} height={element.height * scale} viewBox={`0 0 ${element.barcode.width} ${element.height}`} preserveAspectRatio="none" style={{ position: "absolute", left: element.x * scale, top: element.y * scale }}>
          <rect width={element.barcode.width} height={element.height} fill={paperColor} />
          {element.barcode.bars.map((bar, barIndex) => <rect key={barIndex} x={bar.x} y={0} width={bar.width} height={element.height} fill={paperInk} />)}
        </svg>;
      })}
    </div>
  );
}

/** Shared by the profile endpoint and the default metadata image. */
export function receiptOgElement(data: ReceiptData, options: { showStamp?: boolean } = {}) {
  const { snapshot, stats } = data;
  const target = receiptQrTarget(siteConfig.siteUrl, snapshot.source === "demo" ? "" : snapshot.username, snapshot.year);
  const qr = snapshot.available ? createQrPath(target.url) : undefined;
  const layout = layoutReceipt(displayLines(data), { qr, qrLabel: target.label, showStamp: options.showStamp });
  const profile = snapshot.source === "demo" ? "Sample receipt" : `@${snapshot.username}`;
  const total = formatReceiptNumber(stats.totalContributions);
  return (
    <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", background: "#e8edf0", color: "#26333c", padding: "44px 64px", alignItems: "center", justifyContent: "space-between", fontFamily: "Geist" }}>
      <div style={{ display: "flex", position: "absolute", left: 704, top: 0, height: 630, width: 1, background: "#d9e1e5" }} />
      <div style={{ display: "flex", flexDirection: "column", width: 616, height: "100%", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 23, fontWeight: 700, letterSpacing: -0.8 }}>
          <span style={{ display: "flex", width: 32, height: 32, marginRight: 12, borderRadius: 6, alignItems: "center", justifyContent: "center", fontFamily: "Geist Mono", fontSize: 12, fontWeight: 700, letterSpacing: -0.6, color: "#ffffff", background: "#45657c" }}>GR</span>
          git receipts
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>
          <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 12, letterSpacing: 1.8, color: "#607785", marginBottom: 22 }}>GITHUB ACTIVITY RECEIPT</div>
          <div style={{ display: "flex", fontSize: 64, lineHeight: 1.08, fontWeight: 700, letterSpacing: -2.6 }}>Your GitHub year,</div>
          <div style={{ display: "flex", fontSize: 64, lineHeight: 1.08, fontWeight: 700, letterSpacing: -2.6, color: "#45657c" }}>on paper.</div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 25, fontFamily: "Geist Mono", fontSize: snapshot.username.length > 26 ? 18 : 22, color: "#526570", whiteSpace: "nowrap" }}>{profile}<span style={{ margin: "0 14px", color: "#a0aeb7" }}>/</span>{snapshot.year}</div>
        </div>
        {snapshot.available ? <div style={{ display: "flex", alignItems: "flex-end", paddingTop: 24, borderTop: "1px solid #cad5dc", width: 588 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 260 }}>
            <div style={{ display: "flex", fontSize: total.length > 10 ? 38 : 52, fontWeight: 700, letterSpacing: -1.7, lineHeight: 1.05 }}>{total}</div>
            <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 11, letterSpacing: 1.2, color: "#657782", marginTop: 9 }}>CONTRIBUTIONS</div>
          </div>
          {stats.calendarComplete && <div style={{ display: "flex", flexDirection: "column", width: 155 }}>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05 }}>{formatReceiptNumber(stats.activeDays)}</div>
            <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 11, letterSpacing: 1.2, color: "#657782", marginTop: 9 }}>ACTIVE DAYS</div>
          </div>}
          {stats.calendarComplete && <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05 }}>{formatReceiptNumber(stats.longestStreak)}<span style={{ display: "flex", fontSize: 17, fontWeight: 400, marginLeft: 5, alignSelf: "flex-end", marginBottom: 2 }}>days</span></div>
            <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 11, letterSpacing: 1.2, color: "#657782", marginTop: 9 }}>LONGEST STREAK</div>
          </div>}
        </div> : <div style={{ display: "flex", flexDirection: "column", paddingTop: 22, borderTop: "1px solid #cad5dc", width: 588 }}>
          <div style={{ display: "flex", fontSize: 27, fontWeight: 700 }}>{snapshot.rateLimited ? "Out of paper." : "Receipt unavailable."}</div>
          <div style={{ display: "flex", fontSize: 17, color: "#657782", marginTop: 8 }}>Try this profile again in a little while.</div>
        </div>}
      </div>
      <div style={{ display: "flex", width: 370, height: "100%", alignItems: "center", justifyContent: "center" }}>{paperElement(layout)}</div>
    </div>
  );
}

export function receiptOgImage(data: ReceiptData, options: { showStamp?: boolean } = {}): ImageResponse {
  return new ImageResponse(receiptOgElement(data, options), { ...receiptOgSize, fonts: ogFonts() });
}

let cachedFonts: NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"];

function ogFonts() {
  if (!cachedFonts) {
    cachedFonts = [
      { name: "Geist", data: readFileSync(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf")), weight: 400, style: "normal" },
      { name: "Geist", data: readFileSync(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf")), weight: 700, style: "normal" },
      { name: "Geist Mono", data: readFileSync(join(process.cwd(), "node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.ttf")), weight: 400, style: "normal" },
      { name: "Geist Mono", data: readFileSync(join(process.cwd(), "node_modules/geist/dist/fonts/geist-mono/GeistMono-Bold.ttf")), weight: 700, style: "normal" },
    ];
  }
  return cachedFonts;
}
