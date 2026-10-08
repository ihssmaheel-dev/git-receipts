import { layoutReceipt, receiptTextWidth } from "./receiptLayout";
import { receiptLineText } from "./receiptLines";
import type { ReceiptData } from "./types";
import type { ReceiptQr } from "./qr";
import { isReceiptSealText, renderReceiptSealSvg } from "./receiptSeal";

type SvgOptions = {
  data: ReceiptData;
  theme?: "light" | "dark";
  animated?: boolean;
  showStamp?: boolean;
  qr?: ReceiptQr;
  qrLabel?: string;
  permalink?: string;
};

/** Escape every data value, including text and attribute content. */
export function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A standalone thermal receipt, with no printer chrome baked into the download. */
export function renderReceiptSvg({ data, theme = "light", animated = true, showStamp = true, qr, qrLabel, permalink }: SvgOptions): string {
  const { width, height, elements } = layoutReceipt(data.lines, { qr, qrLabel, permalink, showStamp });
  const ink = theme === "dark" ? "#e4e9ec" : "#232321";
  const paperColor = theme === "dark" ? "#2c3338" : "#f9f8f3";
  const content = elements.map((element) => {
    if (element.type === "text") {
      const anchor = element.align === "center" ? "middle" : element.align === "right" ? "end" : "start";
      const node = `<text x="${element.x}" y="${element.y}" font-size="${element.size}" text-anchor="${anchor}" font-weight="${element.bold ? "700" : "400"}" fill="${ink}" textLength="${receiptTextWidth(element.value, element.size).toFixed(2)}" lengthAdjust="spacingAndGlyphs">${escapeXml(element.value)}</text>`;
      return element.link ? `<a href="${escapeXml(element.link)}">${node}</a>` : node;
    }
    if (element.type === "seal") {
      const seal = renderReceiptSealSvg(theme === "dark" ? { ...element.seal, ink: "#d99b89" } : element.seal);
      return `<g transform="translate(${element.x} ${element.y}) scale(${element.scale})"><g class="stamp-impression">${seal}</g></g>`;
    }
    if (element.type === "rule") {
      return `<path d="M${element.x} ${element.y}h${element.width}" fill="none" stroke="${ink}" stroke-opacity=".65" stroke-width=".65" stroke-dasharray="3 3"/>`;
    }
    if (element.type === "barcode") {
      const bars = element.barcode.bars.map((bar) => `<rect x="${bar.x}" y="0" width="${bar.width}" height="${element.height}"/>`).join("");
      return `<svg class="receipt-barcode" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" viewBox="0 0 ${element.barcode.width} ${element.height}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Code 128 receipt number ${escapeXml(element.barcode.value)}" fill="${ink}"><rect class="barcode-paper" x="0" y="0" width="${element.barcode.width}" height="${element.height}" fill="${paperColor}"/>${bars}</svg>`;
    }
    const fullSize = element.qr.size + 8;
    return `<svg class="receipt-qr" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.width}" viewBox="-4 -4 ${fullSize} ${fullSize}" shape-rendering="crispEdges"><rect x="-4" y="-4" width="${fullSize}" height="${fullSize}" fill="${paperColor}"/><path d="${escapeXml(element.qr.path)}" fill="${ink}"/></svg>`;
  }).join("");

  const teeth: string[] = [];
  for (let x = width; x >= 0; x -= 4) teeth.push(`${x},${height - (teeth.length % 2 === 0 ? 4 : 0)}`);
  const paper = `0,0 ${width},0 ${teeth.join(" ")} 0,0`;
  const title = `Git receipt for ${data.snapshot.username}, ${data.snapshot.year}`;
  const description = data.lines.filter((line) => showStamp || !(line.type === "text" && isReceiptSealText(line.text))).map(receiptLineText).filter(Boolean).join(". ");
  const stampAnimation = showStamp && elements.some((element) => element.type === "seal")
    ? `.stamp-impression{transform-origin:66px 66px;animation:stamp-punch .58s cubic-bezier(.16,.8,.25,1) 3.45s 1 both}@keyframes stamp-punch{0%{opacity:0;transform:translateY(-15px) scale(1.26)}38%{opacity:.9;transform:translateY(2px) scale(.96)}62%{opacity:1;transform:translateY(-1px) scale(1.015)}100%{opacity:1;transform:translateY(0) scale(1)}}`
    : "";
  const animationCss = animated
    ? `.feed-window{animation:feed 3s steps(42,end) 0.35s 1 both}@keyframes feed{from{height:0px}to{height:${height}px}}${stampAnimation}@media(prefers-reduced-motion:reduce){.feed-window{animation:none;height:${height}px}.stamp-impression{animation:none;opacity:1;transform:none}}`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="receipt-title receipt-description">
<title id="receipt-title">${escapeXml(title)}</title>
<desc id="receipt-description">${escapeXml(description)}</desc>
<defs><clipPath id="paper-window"><rect class="feed-window" width="${width}" height="${height}"/></clipPath></defs>
<style>text{font-family:'Courier New',Courier,monospace}${animationCss}</style>
<g clip-path="url(#paper-window)"><polygon points="${paper}" fill="${paperColor}" stroke="${ink}" stroke-width=".4" stroke-opacity=".08"/>${content}</g>
</svg>`;
}
