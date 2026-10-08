import { formatReceiptNumber } from "./receiptLines";
import type { ReceiptLine } from "./types";
import type { ReceiptQr } from "./qr";
import { createReceiptBarcode, type ReceiptBarcode } from "./receiptBarcode";
import { createReceiptSeal, getReceiptSealOverlay, isReceiptSealText, type ReceiptSeal } from "./receiptSeal";

export type ReceiptText = {
  type: "text";
  value: string;
  x: number;
  y: number;
  size: number;
  align: "left" | "center" | "right";
  bold: boolean;
  link?: string;
};
export type ReceiptRule = { type: "rule"; x: number; y: number; width: number };
export type ReceiptQrPlacement = { type: "qr"; x: number; y: number; width: number; qr: ReceiptQr };
export type ReceiptBarcodePlacement = { type: "barcode"; x: number; y: number; width: number; height: number; barcode: ReceiptBarcode };
export type ReceiptSealPlacement = { type: "seal"; x: number; y: number; scale: number; value: string; seal: ReceiptSeal };
export type ReceiptLayout = {
  width: number;
  height: number;
  elements: (ReceiptText | ReceiptRule | ReceiptQrPlacement | ReceiptBarcodePlacement | ReceiptSealPlacement)[];
};

export const receiptPaperWidth = 360;
export const receiptPaperMargin = 24;

/** Courier's fixed advance is shared by the vector PDF and SVG layouts. */
export function receiptTextWidth(text: string, size: number): number {
  return Array.from(text).length * size * 0.6;
}

export function wrapReceiptText(text: string, limit: number): string[] {
  const words = text.trim().split(/\s+/);
  const rows: string[] = [];
  let row = "";
  for (const word of words) {
    if (row && row.length + word.length + 1 > limit) {
      rows.push(row);
      row = "";
    }
    if (word.length > limit) {
      if (row) rows.push(row);
      row = "";
      for (let index = 0; index < word.length; index += limit) {
        const part = word.slice(index, index + limit);
        if (part.length === limit) rows.push(part);
        else row = part;
      }
    } else row = row ? `${row} ${word}` : word;
  }
  if (row) rows.push(row);
  return rows.length ? rows : [""];
}

/** Every exported format consumes these positions, rather than estimating its own rows. */
export function layoutReceipt(
  lines: ReceiptLine[],
  options: { qr?: ReceiptQr; qrLabel?: string; permalink?: string; showStamp?: boolean } = {},
): ReceiptLayout {
  const width = receiptPaperWidth;
  const left = receiptPaperMargin;
  const right = width - receiptPaperMargin;
  const contentWidth = right - left;
  const center = width / 2;
  const elements: ReceiptLayout["elements"] = [];
  let y = 42;
  let previousType: ReceiptLine["type"] | undefined;
  const bill = lines.find((line) => line.type === "pair" && line.label === "BILL NO." && /^[0-9]+-[0-9]+-[0-9]+$/.test(line.value));
  let receiptNumber = bill?.type === "pair" ? bill.value : undefined;
  const seal = options.showStamp === false ? null : createReceiptSeal(lines);
  let sealAnchor: number | undefined;

  const addText = (value: string, x: number, size = 12, align: ReceiptText["align"] = "left", bold = false, link?: string) => {
    // Standard thermal fonts use ASCII separators; they also copy cleanly out of PDFs.
    const printable = value.replace(/[\u2013\u2014]/g, "-").replace(/\u00b7/g, ".");
    elements.push({ type: "text", value: printable, x, y, size, align, bold, ...(link ? { link } : {}) });
  };
  const addRows = (value: string, align: "left" | "center" = "left", size = 12, maxWidth = contentWidth, bold = false, link?: string, advance = 19) => {
    const rows = wrapReceiptText(value, Math.max(1, Math.floor(maxWidth / (size * 0.6))));
    for (const row of rows) {
      addText(row, align === "center" ? center : left, size, align, bold, link);
      y += advance;
    }
  };

  for (const line of lines) {
    if (line.type === "text" && line.align === "center" && isReceiptSealText(line.text)) {
      sealAnchor ??= y;
      continue;
    }
    switch (line.type) {
      case "heading":
        addRows(line.text, "center", 22, contentWidth, true, undefined, 26);
        if (line.detail) addRows(line.detail, "center", 10, contentWidth, false, undefined, 15);
        y += 10;
        break;
      case "text": {
        addRows(line.text, line.align === "center" ? "center" : "left", line.text.startsWith("@") ? 12 : 11, contentWidth, line.text.startsWith("@"));
        break;
      }
      case "divider":
        elements.push({ type: "rule", x: left, y: y - 4, width: contentWidth });
        y += 19;
        break;
      case "item": {
        if (previousType !== "item") {
          addText("ACTIVITY", left, 10);
          addText("COUNT", right, 10, "right");
          y += 19;
        }
        const total = formatReceiptNumber(line.total);
        const nameLeft = left;
        const available = contentWidth - receiptTextWidth(total, 12) - 14;
        if (available < 8 * 7.2) {
          addRows(line.name);
          for (const row of wrapReceiptText(total, Math.floor(contentWidth / 7.2))) {
            addText(row, right, 12, "right");
            y += 19;
          }
          break;
        }
        const rows = wrapReceiptText(line.name, Math.floor(available / 7.2));
        addText(rows[0], nameLeft);
        addText(total, right, 12, "right");
        y += 19;
        for (const row of rows.slice(1)) {
          addText(row, nameLeft);
          y += 19;
        }
        break;
      }
      case "total": {
        y += 6;
        const value = formatReceiptNumber(line.value);
        const size = Math.min(22, Math.max(12, (contentWidth - receiptTextWidth(line.label, 12) - 14) / (value.length * 0.6)));
        if (receiptTextWidth(value, size) + 14 >= contentWidth) {
          addRows(line.label, "left", 12, contentWidth, true);
          for (const row of wrapReceiptText(value, Math.floor(contentWidth / 7.2))) {
            addText(row, right, 12, "right", true);
            y += 19;
          }
          break;
        }
        const labelRows = wrapReceiptText(line.label, Math.max(1, Math.floor((contentWidth - receiptTextWidth(value, size) - 14) / 7.2)));
        addText(labelRows[0], left, 12, "left", true);
        addText(value, right, size, "right", true);
        y += 28;
        for (const row of labelRows.slice(1)) {
          addText(row, left, 12, "left", true);
          y += 19;
        }
        break;
      }
      case "pair": {
        const available = contentWidth - receiptTextWidth(line.value, 12) - 14;
        if (available < 10 * 7.2) {
          addRows(line.label);
          for (const row of wrapReceiptText(line.value, Math.floor(contentWidth / 7.2))) {
            addText(row, right, 12, "right");
            y += 19;
          }
          break;
        }
        const rows = wrapReceiptText(line.label, Math.floor(available / 7.2));
        addText(rows[0], left);
        addText(line.value, right, 12, "right");
        y += 19;
        for (const row of rows.slice(1)) {
          addText(row, left);
          y += 19;
        }
        break;
      }
      case "spacer":
        y += 12;
        break;
      case "footer":
        if (/^No\. [0-9]+-[0-9]+-[0-9]+$/.test(line.text)) {
          receiptNumber ??= line.text.slice(4);
          break;
        }
        y += 2;
        addRows(line.text, "center", 9, contentWidth, false, undefined, 15);
        break;
    }
    if (line.type === "total") sealAnchor = y;
    previousType = line.type;
  }

  if (options.qr) {
    y += 10;
    const qrWidth = 104;
    elements.push({ type: "qr", x: center - qrWidth / 2, y, width: qrWidth, qr: options.qr });
    y += qrWidth + 17;
    addText(options.qrLabel || "OPEN THIS RECEIPT", center, 9, "center");
    y += 15;
  }
  if (options.permalink) {
    addRows(options.permalink.replace(/^https?:\/\//, ""), "center", 8, contentWidth, false, options.permalink, 14);
  }

  if (receiptNumber) {
    const barcode = createReceiptBarcode(receiptNumber);
    const barcodeWidth = Math.min(contentWidth, 280);
    y += 10;
    elements.push({ type: "barcode", x: center - barcodeWidth / 2, y, width: barcodeWidth, height: 32, barcode });
    y += 47;
    addText(`No. ${receiptNumber}`, center, 9, "center");
    y += 15;
  }

  const bottom = elements.reduce((edge, element) => Math.max(edge,
    element.type === "qr" ? element.y + element.width : element.type === "barcode" ? element.y + element.height : element.type === "seal" ? 0 : element.type === "text" ? element.y + element.size * 0.25 : element.y), 24);
  const height = Math.ceil(bottom + 24);
  if (seal && sealAnchor !== undefined) {
    const qrPlacement = elements.find((element) => element.type === "qr");
    const overlay = getReceiptSealOverlay(seal, {
      width, top: sealAnchor, bottom: height - 8,
      qrArea: qrPlacement && { x: qrPlacement.x, y: qrPlacement.y, width: qrPlacement.width, height: qrPlacement.width },
      protectedAreas: elements.flatMap((element) => element.type === "qr"
        ? [{ x: element.x, y: element.y, width: element.width, height: element.width }]
        : element.type === "barcode" ? [{ x: element.x, y: element.y, width: element.width, height: element.height }] : []),
    });
    if (overlay) elements.unshift({ type: "seal", value: seal.text, seal, ...overlay });
  }
  return { width, height, elements };
}
