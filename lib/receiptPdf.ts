import { PDFDocument, PDFName, PDFString, StandardFonts, degrees, rgb } from "pdf-lib";
import { layoutReceipt, receiptTextWidth } from "./receiptLayout";
import type { ReceiptData } from "./types";
import type { ReceiptQr } from "./qr";

export const receiptPdfWidth = 80 * 72 / 25.4;

/** Courier's standard PDF encoding has no star glyph; keep the achievement mark vector. */
function achievementStarPath(): string {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 === 0 ? 0.36 : 0.16;
    return `${index ? "L" : "M"}${(Math.cos(angle) * radius).toFixed(4)} ${(Math.sin(angle) * radius).toFixed(4)}`;
  }).join("") + "Z";
}

/** Vector type and modules stay sharp on real thermal printers at their native 80mm width. */
export async function renderReceiptPdf(options: {
  data: ReceiptData;
  qr?: ReceiptQr;
  qrLabel?: string;
  permalink?: string;
  showStamp?: boolean;
}): Promise<Uint8Array> {
  const layout = layoutReceipt(options.data.lines, { qr: options.qr, qrLabel: options.qrLabel, permalink: options.permalink, showStamp: options.showStamp });
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Courier);
  const bold = await document.embedFont(StandardFonts.CourierBold);
  const scale = receiptPdfWidth / layout.width;
  const height = layout.height * receiptPdfWidth / layout.width;
  const page = document.addPage([receiptPdfWidth, height]);
  const ink = rgb(35 / 255, 35 / 255, 33 / 255);
  document.setTitle(`Git receipt - ${options.data.snapshot.username} - ${options.data.snapshot.year}`);
  document.setSubject("GitHub contribution receipt");
  document.setCreator("Git Receipts");
  document.setProducer("Git Receipts");

  const annotations = [];
  for (const element of layout.elements) {
    if (element.type === "text") {
      const textWidth = receiptTextWidth(element.value, element.size);
      const x = (element.x - (element.align === "center" ? textWidth / 2 : element.align === "right" ? textWidth : 0)) * scale;
      const y = height - element.y * scale;
      const font = element.bold ? bold : regular;
      const parts = element.value.split("★");
      let offset = 0;
      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (part) page.drawText(part, { x: x + offset * scale, y, size: element.size * scale, font, color: ink });
        offset += receiptTextWidth(part, element.size);
        if (index < parts.length - 1) {
          page.drawSvgPath(achievementStarPath(), { x: x + (offset + element.size * 0.3) * scale, y: y + element.size * 0.34 * scale, scale: element.size * scale, color: ink });
          offset += element.size * 0.6;
        }
      }
      if (element.link) {
        const annotation = document.context.obj({
          Type: "Annot", Subtype: "Link", Rect: [x, y - 2 * scale, x + textWidth * scale, y + element.size * scale],
          Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(element.link) },
        });
        annotations.push(document.context.register(annotation));
      }
    } else if (element.type === "seal") {
      const { seal } = element;
      const center = seal.diameter / 2;
      const radians = seal.rotation * Math.PI / 180;
      const colorValue = Number.parseInt(seal.ink.slice(1), 16);
      const sealInk = rgb((colorValue >> 16 & 255) / 255, (colorValue >> 8 & 255) / 255, (colorValue & 255) / 255);
      const stampScale = scale * element.scale;
      const position = (localX: number, localY: number) => ({
        x: element.x * scale + (center + (localX - center) * Math.cos(radians) - (localY - center) * Math.sin(radians)) * stampScale,
        y: height - element.y * scale - (center + (localX - center) * Math.sin(radians) + (localY - center) * Math.cos(radians)) * stampScale,
      });
      for (const ring of seal.rings) {
        page.drawEllipse({
          ...position(center, center), xScale: ring.radius * stampScale, yScale: ring.radius * stampScale,
          rotate: degrees(-seal.rotation), borderColor: sealInk, borderWidth: ring.width * stampScale,
          borderOpacity: seal.opacity * (ring.opacity ?? 1),
          ...(ring.dash ? { borderDashArray: ring.dash.split(/\s+/).map((value) => Number(value) * stampScale) } : {}),
        });
      }
      for (const glyph of seal.glyphs) {
        const glyphRotation = glyph.rotation * Math.PI / 180;
        const halfWidth = receiptTextWidth(glyph.text, glyph.size) / 2;
        const ascender = bold.heightAtSize(glyph.size, { descender: false });
        const descender = bold.heightAtSize(glyph.size) - ascender;
        // Match SVG's central baseline, then rotate its left baseline with the arc.
        const baselineOffset = (ascender - descender) / 2;
        const baseline = position(
          glyph.x - Math.cos(glyphRotation) * halfWidth - Math.sin(glyphRotation) * baselineOffset,
          glyph.y - Math.sin(glyphRotation) * halfWidth + Math.cos(glyphRotation) * baselineOffset,
        );
        page.drawText(glyph.text, { ...baseline, size: glyph.size * stampScale, font: bold, color: sealInk, opacity: seal.opacity, rotate: degrees(-seal.rotation - glyph.rotation) });
      }
      page.drawSvgPath(seal.logo.path, { ...position(seal.logo.x, seal.logo.y), scale: stampScale * seal.logo.scale, rotate: degrees(-seal.rotation), color: sealInk, opacity: seal.opacity });
    } else if (element.type === "rule") {
      page.drawLine({
        start: { x: element.x * scale, y: height - element.y * scale },
        end: { x: (element.x + element.width) * scale, y: height - element.y * scale },
        color: ink, thickness: 0.65 * scale, opacity: 0.65, dashArray: [3 * scale, 3 * scale],
      });
    } else if (element.type === "barcode") {
      const moduleSize = element.width / element.barcode.width * scale;
      for (const bar of element.barcode.bars) {
        page.drawRectangle({
          x: element.x * scale + bar.x * moduleSize,
          y: height - (element.y + element.height) * scale,
          width: bar.width * moduleSize, height: element.height * scale, color: ink,
        });
      }
    } else {
      const moduleSize = element.width / (element.qr.size + 8) * scale;
      const runs = element.qr.path.matchAll(/M(\d+) (\d+)h(\d+)v1H\d+z/g);
      for (const run of runs) {
        const column = Number(run[1]);
        const row = Number(run[2]);
        const modules = Number(run[3]);
        page.drawRectangle({
          x: element.x * scale + (column + 4) * moduleSize,
          y: height - element.y * scale - (row + 5) * moduleSize,
          width: modules * moduleSize, height: moduleSize, color: ink,
        });
      }
    }
  }
  if (annotations.length) page.node.set(PDFName.of("Annots"), document.context.obj(annotations));
  return document.save();
}
