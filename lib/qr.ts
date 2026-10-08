import QRCode from "qrcode";

/** Module coordinates, without a border; renderers add the four-module quiet zone. */
export type ReceiptQr = { path: string; size: number };

export function createQrPath(url: string): ReceiptQr {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const commands: string[] = [];

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      const start = column;
      while (column + 1 < size && qr.modules.get(row, column + 1)) column += 1;
      commands.push(`M${start} ${row}h${column - start + 1}v1H${start}z`);
    }
  }

  return { path: commands.join(""), size };
}

export function receiptPermalink(siteUrl: string, username: string, year: number): string {
  const url = new URL(siteUrl);
  if (username) url.searchParams.set("user", username);
  else url.searchParams.delete("user");
  url.searchParams.set("year", String(year));
  return url.toString();
}

/** A phone cannot open another computer's localhost; keep local QR codes useful. */
export function receiptQrTarget(siteUrl: string, username: string, year: number): { url: string; label: string } {
  const hostname = new URL(siteUrl).hostname.toLowerCase();
  const isLocal = hostname === "localhost" || hostname === "0.0.0.0" || /^127\./.test(hostname) || hostname === "[::1]" || hostname === "::1";
  if (isLocal) {
    return { url: username ? `https://github.com/${encodeURIComponent(username)}` : "https://github.com", label: "OPEN GITHUB PROFILE" };
  }
  return { url: receiptPermalink(siteUrl, username, year), label: "OPEN THIS RECEIPT" };
}
