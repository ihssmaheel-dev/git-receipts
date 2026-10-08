import { isValidPrintInput, recordPrint } from "@/lib/prints";
import { checkLimit, clientIpHash, limitFromEnv, rateLimitResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024;

/**
 * Counts one completed print toward the public total. Replayed run keys are
 * free but add nothing; validation and rate limiting run before any write,
 * and database outages degrade to an accepted-but-uncounted response.
 */
export async function POST(request: Request) {
  const gate = await checkLimit(`prints:${clientIpHash(request)}`, {
    limit: limitFromEnv("RATE_LIMIT_PRINTS", 10),
    windowMs: 60_000,
    store: "turso",
  });
  if (!gate.allowed) return rateLimitResponse(gate.retryAfterMs, "Too many prints. Slow down a little.");

  let fields: { user?: unknown; year?: unknown; runKey?: unknown };
  try {
    // Reject oversized bodies before buffering them into memory.
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return Response.json({ error: "Bad request." }, { status: 413 });
    }
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return Response.json({ error: "Bad request." }, { status: 413 });
    }
    fields = (text ? JSON.parse(text) as unknown : {}) as typeof fields;
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  if (!isValidPrintInput(fields)) {
    return Response.json({ error: "Enter a valid GitHub username, year, and print key." }, { status: 400 });
  }

  const result = await recordPrint({
    username: fields.user,
    year: fields.year,
    runKey: fields.runKey,
    ipHash: clientIpHash(request),
  });
  return Response.json(
    { counted: result.counted, total: result.total },
    { status: result.total !== null ? 200 : 202 },
  );
}
