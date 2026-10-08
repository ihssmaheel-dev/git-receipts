import { getReceiptData } from "@/lib/github";
import { receiptOgImage } from "@/lib/og";
import { parseReceiptRequest } from "@/lib/receiptRequest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const options = parseReceiptRequest(new URL(request.url));
  if ("error" in options) return new Response(options.error, { status: 400 });

  const data = await getReceiptData(options.year, options.username);
  const image = receiptOgImage(data, { showStamp: options.showStamp });
  image.headers.set("Cache-Control", data.snapshot.available && data.snapshot.source !== "fallback"
    ? "public, s-maxage=3600, stale-while-revalidate=86400"
    : "public, s-maxage=60, stale-while-revalidate=60");
  image.headers.set("X-Content-Type-Options", "nosniff");
  return image;
}
