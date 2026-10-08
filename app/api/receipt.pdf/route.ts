import { siteConfig } from "@/lib/config";
import { getReceiptData } from "@/lib/github";
import { createQrPath, receiptQrTarget } from "@/lib/qr";
import { renderReceiptPdf } from "@/lib/receiptPdf";
import { parseReceiptRequest } from "@/lib/receiptRequest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const options = parseReceiptRequest(new URL(request.url));
  if ("error" in options) return new Response(options.error, { status: 400 });

  const data = await getReceiptData(options.year, options.username);
  const target = receiptQrTarget(siteConfig.siteUrl, data.snapshot.source === "demo" ? "" : data.snapshot.username, data.snapshot.year);
  const pdf = await renderReceiptPdf({ data, qr: createQrPath(target.url), qrLabel: target.label, permalink: target.url, showStamp: options.showStamp });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": data.snapshot.available && data.snapshot.source !== "fallback"
        ? "public, s-maxage=3600, stale-while-revalidate=86400"
        : "public, s-maxage=60, stale-while-revalidate=60",
      "Content-Disposition": `attachment; filename="${data.snapshot.username}-${data.snapshot.year}-receipt.pdf"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
