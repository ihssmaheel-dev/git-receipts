import { siteConfig } from "@/lib/config";
import { getReceiptData } from "@/lib/github";
import { createQrPath, receiptQrTarget } from "@/lib/qr";
import { parseReceiptRequest } from "@/lib/receiptRequest";
import { renderReceiptSvg } from "@/lib/receiptSvg";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const options = parseReceiptRequest(new URL(request.url));
  if ("error" in options) return new Response(options.error, { status: 400 });

  const data = await getReceiptData(options.year, options.username);
  const target = receiptQrTarget(siteConfig.siteUrl, data.snapshot.source === "demo" ? "" : data.snapshot.username, data.snapshot.year);
  const qr = createQrPath(target.url);
  const svg = renderReceiptSvg({ data, theme: options.theme, animated: options.animated, showStamp: options.showStamp, qr, qrLabel: target.label, permalink: target.url });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": data.snapshot.available && data.snapshot.source !== "fallback"
        ? "public, s-maxage=3600, stale-while-revalidate=86400"
        : "public, s-maxage=60, stale-while-revalidate=60",
      "Content-Disposition": `inline; filename="${data.snapshot.username}-${data.snapshot.year}-receipt.svg"`,
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
