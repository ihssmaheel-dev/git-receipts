import { getPrintCount, isValidPrintInput, recordPrint } from "@/lib/prints";
import { checkLimit, clientIpHash, limitFromEnv, rateLimitResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024;

/** Refresh the visible public count without consuming completed-print slots. */
export async function GET(request: Request) {
  const gate = await checkLimit(`print-count:${clientIpHash(request)}`, {
    limit: limitFromEnv("RATE_LIMIT_PRINTS", 10),
    windowMs: 60_000,
    store: "turso",
  });
  if (!gate.allowed) return rateLimitResponse(gate.retryAfterMs);
  return Response.json({ total: await getPrintCount() }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Bound actual UTF-8 bytes, including requests without Content-Length. */
async function readBody(request: Request): Promise<string | null> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const body = new Uint8Array(MAX_BODY_BYTES);
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (length + chunk.value.byteLength > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      body.set(chunk.value, length);
      length += chunk.value.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(body.subarray(0, length));
  } finally {
    reader.releaseLock();
  }
}

/**
 * Counts one completed print toward the public total. Replayed run keys are
 * free but add nothing; validation and rate limiting run before any write,
 * and database outages degrade to an accepted-but-uncounted response.
 */
export async function POST(request: Request) {
  const ipHash = clientIpHash(request);
  const gate = await checkLimit(`prints:${ipHash}`, {
    limit: limitFromEnv("RATE_LIMIT_PRINTS", 10),
    windowMs: 60_000,
    store: "turso",
  });
  if (!gate.allowed) return rateLimitResponse(gate.retryAfterMs, "Too many prints. Slow down a little.");

  let body: unknown;
  try {
    const text = await readBody(request);
    if (text === null) {
      return Response.json({ error: "Bad request." }, { status: 413 });
    }
    body = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Enter a valid GitHub username, year, and print key." }, { status: 400 });
  }
  const fields = body as { user?: unknown; year?: unknown; runKey?: unknown };
  const input = { username: fields.user, year: fields.year, runKey: fields.runKey };
  if (!isValidPrintInput(input)) {
    return Response.json({ error: "Enter a valid GitHub username, year, and print key." }, { status: 400 });
  }

  const result = await recordPrint({
    ...input,
    ipHash,
  });
  return Response.json(
    { counted: result.counted, total: result.total },
    { status: result.total !== null ? 200 : 202 },
  );
}
